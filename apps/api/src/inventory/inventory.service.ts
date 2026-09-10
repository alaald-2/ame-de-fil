import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InventoryMovementType, Prisma, StockReservationStatus } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import {
  LOW_STOCK_ITEM_SELECT,
  MOVEMENT_LEDGER_SELECT,
  RESERVATION_LIST_SELECT,
  mapInventoryItem,
  mapInventoryItemWithMovements,
  mapMovementLedgerItem,
  mapReservationListItem,
  type InventoryItemWithContext,
} from "./mappers/inventory.mapper.ts";
import type { AdjustStockInput } from "./dto/adjust-stock.dto.ts";
import type { ListReservationsQuery } from "./dto/list-reservations.dto.ts";
import type { ListMovementsQuery } from "./dto/list-movements.dto.ts";

const ITEM_INCLUDE = {
  variant: { include: { product: { include: { translations: true } } } },
} as const;

// Only finite-stock items with a threshold actually set can ever be "low
// stock" — a made-to-order line (tracksStock=false) has no ceiling to run
// low on, and an item with lowStockThreshold: null has nothing to compare
// against (Postgres's own NULL semantics already make "(onHand - reserved)
// < NULL" false, but the explicit clause below documents that intent
// rather than relying on it implicitly). "onHand - reserved <
// lowStockThreshold" compares two columns to each other, which Prisma's
// declarative `where` filters can't express at all (only column-to-
// literal) — raw SQL is the same, already-established escape hatch
// stock-lock.ts uses for the identical class of problem, parameterized via
// Prisma.sql exactly the same way (SECURITY.md §5). Hoisted to module
// scope (not just listLowStock's own local const) so countLowStock below
// — added for the dashboard-metrics checkpoint's alert count, a bare
// number with no list/pagination — shares the identical predicate rather
// than risking the two definitions drifting apart.
const LOW_STOCK_CONDITION = Prisma.sql`
  "tracksStock" = true
  AND "lowStockThreshold" IS NOT NULL
  AND ("onHand" - "reserved") < "lowStockThreshold"
`;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(page: number, pageSize: number) {
    const [rows, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        include: ITEM_INCLUDE,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.inventoryItem.count(),
    ]);

    return {
      items: rows.map((row: InventoryItemWithContext) => mapInventoryItem(row)),
      page,
      pageSize,
      total,
    };
  }

  async listLowStock(page: number, pageSize: number) {
    const [countRows, idRows] = await Promise.all([
      this.prisma.$queryRaw<{ count: number }[]>(
        Prisma.sql`SELECT COUNT(*)::int AS count FROM "InventoryItem" WHERE ${LOW_STOCK_CONDITION}`,
      ),
      this.prisma.$queryRaw<{ id: string }[]>(
        // Most urgent (lowest, or most negative, available quantity) first;
        // id as a stable tiebreaker for deterministic pagination.
        Prisma.sql`
          SELECT "id" FROM "InventoryItem"
          WHERE ${LOW_STOCK_CONDITION}
          ORDER BY ("onHand" - "reserved") ASC, "id" ASC
          LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
        `,
      ),
    ]);

    const total = countRows[0]?.count ?? 0;
    const orderedIds = idRows.map((row) => row.id);
    if (orderedIds.length === 0) {
      return { items: [], page, pageSize, total };
    }

    const rows = await this.prisma.inventoryItem.findMany({
      where: { id: { in: orderedIds } },
      select: LOW_STOCK_ITEM_SELECT,
    });

    // `id IN (...)` doesn't preserve the raw query's ORDER BY — re-sort
    // into the urgency order the raw query already determined.
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = orderedIds.map((id) => byId.get(id)).filter((row) => row !== undefined);

    return {
      items: ordered.map((row) => mapInventoryItem(row)),
      page,
      pageSize,
      total,
    };
  }

  // Bare count only, no list/pagination — the dashboard-metrics
  // checkpoint's alert figure, which reuses this predicate rather than
  // duplicating it so the two counts can never drift apart. Surfaced there
  // behind `dashboard.view`, not `inventory.view` — a deliberate choice
  // (SECURITY.md §2): this method itself has no permission check of its
  // own (that's each caller's controller's job), same as every other
  // service in this codebase.
  async countLowStock(): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>(
      Prisma.sql`SELECT COUNT(*)::int AS count FROM "InventoryItem" WHERE ${LOW_STOCK_CONDITION}`,
    );
    return rows[0]?.count ?? 0;
  }

  async getByVariantId(variantId: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { productVariantId: variantId },
      include: ITEM_INCLUDE,
    });
    if (!item) {
      throw new NotFoundException({
        error: "InventoryItemNotFound",
        message: `No inventory item for variant "${variantId}"`,
      });
    }

    const movements = await this.prisma.inventoryMovement.findMany({
      where: { inventoryItemId: item.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return mapInventoryItemWithMovements({ ...item, movements });
  }

  // "Current reservations" — distinct from getByVariantId's own capped,
  // single-item movement preview above: this is cross-item, paginated, and
  // filterable. Ordered soonest-to-expire (or already-overdue) first, not
  // "most recent first" like every other list in this codebase — an
  // operational triage view, not a browsing history, same reasoning as
  // listLowStock's "most urgent first." A PENDING row whose expiresAt has
  // already passed is shown as-is, never filtered out or specially
  // flagged — ReservationExpiryService hasn't swept it yet, and hiding it
  // would misrepresent the real, if momentarily stale, state.
  async listReservations(query: ListReservationsQuery) {
    const { page, pageSize, status, variantId } = query;
    const where: Prisma.StockReservationWhereInput = {};
    if (status !== "ALL") where.status = StockReservationStatus[status];
    if (variantId) where.inventoryItem = { productVariantId: variantId };

    const [rows, total] = await Promise.all([
      this.prisma.stockReservation.findMany({
        where,
        select: RESERVATION_LIST_SELECT,
        orderBy: { expiresAt: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.stockReservation.count({ where }),
    ]);

    return { items: rows.map(mapReservationListItem), page, pageSize, total };
  }

  // Cross-item movement ledger — ordered most-recent-first (the standard
  // convention every other list here uses), unlike listReservations above:
  // this is a historical record, not a triage queue.
  async listMovements(query: ListMovementsQuery) {
    const { page, pageSize, type, variantId, from: fromInput, to: toInput } = query;
    const where: Prisma.InventoryMovementWhereInput = {};
    if (type) where.type = type;
    if (variantId) where.inventoryItem = { productVariantId: variantId };

    if (fromInput || toInput) {
      const from = fromInput ? new Date(fromInput) : undefined;
      const to = toInput ? new Date(toInput) : undefined;
      if (from && to && from.getTime() >= to.getTime()) {
        throw new BadRequestException({
          error: "InvalidDateRange",
          message: `"from" must be strictly before "to"`,
        });
      }
      where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };
    }

    const [rows, total] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where,
        select: MOVEMENT_LEDGER_SELECT,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    return { items: rows.map(mapMovementLedgerItem), page, pageSize, total };
  }

  // Race-safe by construction, not by a prior read-then-check: the
  // not-negative guard is part of the *same* atomic UPDATE statement as the
  // increment (`WHERE onHand >= -delta` alongside `SET onHand = onHand +
  // delta`), so Postgres evaluates both atomically at the row level. A
  // separate "read onHand, check in application code, then write" would be
  // a genuine TOCTOU race under concurrent adjustments — two concurrent
  // decrements could each pass an application-level check independently and
  // still drive onHand negative together. This is the reservation flow's
  // same principle (DATABASE.md §4) applied to admin stock adjustments.
  async adjustStock(
    variantId: string,
    input: AdjustStockInput,
    actorUserId: string,
    ipAddress?: string,
  ) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { productVariantId: variantId },
    });
    if (!item) {
      throw new NotFoundException({
        error: "InventoryItemNotFound",
        message: `No inventory item for variant "${variantId}"`,
      });
    }

    const type =
      input.type === "RESTOCK" ? InventoryMovementType.RESTOCK : InventoryMovementType.ADJUSTMENT;

    const updated = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.inventoryItem.updateMany({
        where: {
          id: item.id,
          // Only decreases need the guard — a positive delta can never
          // drive onHand negative.
          ...(input.delta < 0 ? { onHand: { gte: -input.delta } } : {}),
        },
        data: { onHand: { increment: input.delta } },
      });

      if (updateResult.count === 0) {
        throw new BadRequestException({
          error: "InvalidStockAdjustment",
          message: "Adjustment would take onHand negative (or the item changed concurrently)",
        });
      }

      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: item.id,
          type,
          quantity: input.delta,
          reason: input.reason,
          createdByUserId: actorUserId,
        },
      });

      const refreshed = await tx.inventoryItem.findUniqueOrThrow({
        where: { id: item.id },
        include: ITEM_INCLUDE,
      });

      await this.audit.record(
        {
          actorUserId,
          action: "inventory.adjusted",
          entityType: "InventoryItem",
          entityId: item.id,
          before: { onHand: item.onHand },
          after: { onHand: refreshed.onHand, delta: input.delta, reason: input.reason },
          ipAddress,
        },
        tx,
      );

      return refreshed;
    });

    return mapInventoryItem(updated);
  }
}
