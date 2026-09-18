// Integration test (TESTING.md §3 — Vitest + Testcontainers, real Postgres).
// Exercises InventoryService.listReservations/listMovements against a real
// database — filtering/ordering across real StockReservation/
// InventoryMovement rows, and the onDelete: SetNull null-handling for a
// deleted actor/order-item, are exactly what a mocked Prisma client can't
// honestly verify.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { InventoryMovementType, StockReservationStatus } from "@ame-de-fil/database";
import { InventoryService } from "./inventory.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import {
  startTestDatabase,
  stopTestDatabase,
  type TestDatabase,
} from "../test/testcontainers-postgres.ts";
import {
  seedPendingOrder,
  seedShopFixture,
  seedUserWithPermissions,
  seedVariant,
  type ShopFixture,
} from "../test/fixtures.ts";

describe("InventoryService reservations/movements views — real Postgres", () => {
  let db: TestDatabase;
  let shop: ShopFixture;
  let service: InventoryService;

  beforeAll(async () => {
    db = await startTestDatabase();
    shop = await seedShopFixture(db.prisma);
    service = new InventoryService(db.prisma, new AuditService(db.prisma));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase(db);
  });

  describe("listReservations", () => {
    it("defaults to PENDING, ordered soonest-to-expire first, including one already past its own expiresAt", async () => {
      const variant = await seedVariant(db.prisma, shop.taxClassId);
      const soon = await seedPendingOrder(db.prisma, shop, variant, {
        reservationExpiresAt: new Date(Date.now() + 5 * 60_000),
      });
      const overdue = await seedPendingOrder(db.prisma, shop, variant, {
        reservationExpiresAt: new Date(Date.now() - 60_000), // already past — not yet swept
      });
      const later = await seedPendingOrder(db.prisma, shop, variant, {
        reservationExpiresAt: new Date(Date.now() + 15 * 60_000),
      });

      const result = await service.listReservations({ page: 1, pageSize: 50, status: "PENDING" });

      const ids = result.items.map((item) => item.id);
      const overdueIndex = ids.indexOf(overdue.stockReservationId!);
      const soonIndex = ids.indexOf(soon.stockReservationId!);
      const laterIndex = ids.indexOf(later.stockReservationId!);
      expect(overdueIndex).toBeGreaterThanOrEqual(0);
      expect(overdueIndex).toBeLessThan(soonIndex);
      expect(soonIndex).toBeLessThan(laterIndex);

      const overdueItem = result.items.find((item) => item.id === overdue.stockReservationId);
      expect(overdueItem?.status).toBe("PENDING");
      expect(new Date(overdueItem!.expiresAt).getTime()).toBeLessThan(Date.now());
    });

    it("excludes CONSUMED/EXPIRED from the default view but includes them with status=ALL", async () => {
      const variant = await seedVariant(db.prisma, shop.taxClassId);
      const pending = await seedPendingOrder(db.prisma, shop, variant, {
        reservationExpiresAt: new Date(Date.now() + 60_000),
      });
      const consumed = await seedPendingOrder(db.prisma, shop, variant, {
        reservationExpiresAt: new Date(Date.now() + 60_000),
      });
      await db.prisma.stockReservation.update({
        where: { id: consumed.stockReservationId! },
        data: { status: StockReservationStatus.CONSUMED },
      });

      const defaultView = await service.listReservations({
        page: 1,
        pageSize: 50,
        status: "PENDING",
      });
      expect(defaultView.items.map((i) => i.id)).toContain(pending.stockReservationId);
      expect(defaultView.items.map((i) => i.id)).not.toContain(consumed.stockReservationId);

      const allView = await service.listReservations({ page: 1, pageSize: 50, status: "ALL" });
      expect(allView.items.map((i) => i.id)).toContain(pending.stockReservationId);
      expect(allView.items.map((i) => i.id)).toContain(consumed.stockReservationId);
    });

    it("filters by variantId, and maps variant/order context without any customer PII", async () => {
      const variantA = await seedVariant(db.prisma, shop.taxClassId);
      const variantB = await seedVariant(db.prisma, shop.taxClassId);
      const forA = await seedPendingOrder(db.prisma, shop, variantA, {
        reservationExpiresAt: new Date(Date.now() + 60_000),
      });
      await seedPendingOrder(db.prisma, shop, variantB, {
        reservationExpiresAt: new Date(Date.now() + 60_000),
      });

      const result = await service.listReservations({
        page: 1,
        pageSize: 50,
        status: "PENDING",
        variantId: variantA.variantId,
      });

      expect(result.items.every((item) => item.variantId === variantA.variantId)).toBe(true);
      const item = result.items.find((i) => i.id === forA.stockReservationId);
      const order = await db.prisma.order.findUniqueOrThrow({ where: { id: forA.orderId } });
      expect(item).toMatchObject({
        variantId: variantA.variantId,
        orderId: forA.orderId,
        orderNumber: order.orderNumber,
      });
      expect(Object.keys(item ?? {})).not.toContain("guestEmail");
      expect(Object.keys(item ?? {})).not.toContain("email");
    });
  });

  describe("listMovements", () => {
    async function seedMovement(options: {
      inventoryItemId: string;
      type?: InventoryMovementType;
      createdAt: Date;
      createdByUserId?: string | null;
      relatedOrderItemId?: string | null;
    }) {
      return db.prisma.inventoryMovement.create({
        data: {
          inventoryItemId: options.inventoryItemId,
          type: options.type ?? InventoryMovementType.ADJUSTMENT,
          quantity: 1,
          reason: "test",
          createdAt: options.createdAt,
          createdByUserId: options.createdByUserId ?? null,
          relatedOrderItemId: options.relatedOrderItemId ?? null,
        },
      });
    }

    it("orders most-recent-first across items", async () => {
      const variant = await seedVariant(db.prisma, shop.taxClassId);
      const older = await seedMovement({
        inventoryItemId: variant.inventoryItemId,
        createdAt: new Date("2027-01-01T00:00:00.000Z"),
      });
      const newer = await seedMovement({
        inventoryItemId: variant.inventoryItemId,
        createdAt: new Date("2027-01-02T00:00:00.000Z"),
      });

      const result = await service.listMovements({ page: 1, pageSize: 50 });

      const newerIndex = result.items.findIndex((i) => i.id === newer.id);
      const olderIndex = result.items.findIndex((i) => i.id === older.id);
      expect(newerIndex).toBeGreaterThanOrEqual(0);
      expect(newerIndex).toBeLessThan(olderIndex);
    });

    it("filters by type and by variantId", async () => {
      const variantA = await seedVariant(db.prisma, shop.taxClassId);
      const variantB = await seedVariant(db.prisma, shop.taxClassId);
      const restock = await seedMovement({
        inventoryItemId: variantA.inventoryItemId,
        type: InventoryMovementType.RESTOCK,
        createdAt: new Date("2027-02-01T00:00:00.000Z"),
      });
      const adjustment = await seedMovement({
        inventoryItemId: variantA.inventoryItemId,
        type: InventoryMovementType.ADJUSTMENT,
        createdAt: new Date("2027-02-01T00:00:01.000Z"),
      });
      await seedMovement({
        inventoryItemId: variantB.inventoryItemId,
        type: InventoryMovementType.RESTOCK,
        createdAt: new Date("2027-02-01T00:00:02.000Z"),
      });

      const byType = await service.listMovements({ page: 1, pageSize: 50, type: "RESTOCK" });
      expect(byType.items.map((i) => i.id)).toContain(restock.id);
      expect(byType.items.map((i) => i.id)).not.toContain(adjustment.id);

      const byVariant = await service.listMovements({
        page: 1,
        pageSize: 50,
        variantId: variantA.variantId,
      });
      expect(byVariant.items.every((i) => i.variantId === variantA.variantId)).toBe(true);
      expect(byVariant.items.map((i) => i.id).sort()).toEqual([restock.id, adjustment.id].sort());
    });

    it("respects the half-open from/to interval and rejects from >= to", async () => {
      const variant = await seedVariant(db.prisma, shop.taxClassId);
      const from = new Date("2027-03-10T00:00:00.000Z");
      const to = new Date("2027-03-20T00:00:00.000Z");
      const atFrom = await seedMovement({
        inventoryItemId: variant.inventoryItemId,
        createdAt: from,
      });
      const atTo = await seedMovement({ inventoryItemId: variant.inventoryItemId, createdAt: to });

      const result = await service.listMovements({
        page: 1,
        pageSize: 50,
        from: from.toISOString(),
        to: to.toISOString(),
      });

      expect(result.items.map((i) => i.id)).toContain(atFrom.id);
      expect(result.items.map((i) => i.id)).not.toContain(atTo.id);

      await expect(
        service.listMovements({
          page: 1,
          pageSize: 50,
          from: to.toISOString(),
          to: from.toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("resolves createdBy to null for a system-driven movement, and to null again after the actor is deleted", async () => {
      const variant = await seedVariant(db.prisma, shop.taxClassId);
      const systemDriven = await seedMovement({
        inventoryItemId: variant.inventoryItemId,
        type: InventoryMovementType.SALE,
        createdAt: new Date("2027-04-01T00:00:00.000Z"),
      });

      const actor = await seedUserWithPermissions(db.prisma, []);
      const byActor = await seedMovement({
        inventoryItemId: variant.inventoryItemId,
        createdByUserId: actor.userId,
        createdAt: new Date("2027-04-01T00:00:01.000Z"),
      });

      const beforeDelete = await service.listMovements({ page: 1, pageSize: 50 });
      expect(beforeDelete.items.find((i) => i.id === systemDriven.id)?.createdBy).toBeNull();
      expect(beforeDelete.items.find((i) => i.id === byActor.id)?.createdBy).toEqual({
        id: actor.userId,
        email: actor.email,
      });

      await db.prisma.user.delete({ where: { id: actor.userId } });

      const afterDelete = await service.listMovements({ page: 1, pageSize: 50 });
      expect(afterDelete.items.find((i) => i.id === byActor.id)?.createdBy).toBeNull();
    });

    it("resolves orderId/orderNumber to null once the related order is deleted (onDelete: SetNull)", async () => {
      const variant = await seedVariant(db.prisma, shop.taxClassId);
      const seeded = await seedPendingOrder(db.prisma, shop, variant, {
        reservationExpiresAt: new Date(Date.now() + 60_000),
      });
      const order = await db.prisma.order.findUniqueOrThrow({ where: { id: seeded.orderId } });
      const movement = await seedMovement({
        inventoryItemId: variant.inventoryItemId,
        type: InventoryMovementType.RETURN,
        createdAt: new Date("2027-05-01T00:00:00.000Z"),
        relatedOrderItemId: seeded.orderItemId,
      });

      const before = await service.listMovements({ page: 1, pageSize: 50 });
      expect(before.items.find((i) => i.id === movement.id)).toMatchObject({
        orderId: order.id,
        orderNumber: order.orderNumber,
      });

      // Deleting the OrderItem directly (not the whole Order, which a
      // Payment row still references with onDelete: Restrict) SetNulls
      // this movement's relatedOrderItemId — the exact FK behavior being
      // verified here.
      await db.prisma.orderItem.delete({ where: { id: seeded.orderItemId } });

      const after = await service.listMovements({ page: 1, pageSize: 50 });
      expect(after.items.find((i) => i.id === movement.id)).toMatchObject({
        orderId: null,
        orderNumber: null,
      });
    });

    it("computes pagination consistently with the other inventory list endpoints", async () => {
      const variant = await seedVariant(db.prisma, shop.taxClassId);
      await seedMovement({
        inventoryItemId: variant.inventoryItemId,
        createdAt: new Date("2027-06-01T00:00:00.000Z"),
      });

      const result = await service.listMovements({ page: 2, pageSize: 1 });

      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(1);
    });
  });
});
