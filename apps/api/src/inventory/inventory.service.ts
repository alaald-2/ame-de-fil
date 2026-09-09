import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InventoryMovementType } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";
import {
  mapInventoryItem,
  mapInventoryItemWithMovements,
  type InventoryItemWithContext,
} from "./mappers/inventory.mapper.ts";
import type { AdjustStockInput } from "./dto/adjust-stock.dto.ts";

const ITEM_INCLUDE = {
  variant: { include: { product: { include: { translations: true } } } },
} as const;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

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

  // Race-safe by construction, not by a prior read-then-check: the
  // not-negative guard is part of the *same* atomic UPDATE statement as the
  // increment (`WHERE onHand >= -delta` alongside `SET onHand = onHand +
  // delta`), so Postgres evaluates both atomically at the row level. A
  // separate "read onHand, check in application code, then write" would be
  // a genuine TOCTOU race under concurrent adjustments — two concurrent
  // decrements could each pass an application-level check independently and
  // still drive onHand negative together. This is the reservation flow's
  // same principle (DATABASE.md §4) applied to admin stock adjustments.
  async adjustStock(variantId: string, input: AdjustStockInput, actorUserId: string) {
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

      return tx.inventoryItem.findUniqueOrThrow({ where: { id: item.id }, include: ITEM_INCLUDE });
    });

    return mapInventoryItem(updated);
  }
}
