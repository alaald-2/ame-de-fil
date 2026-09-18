// Integration test (TESTING.md §3 — Vitest + Testcontainers, real Postgres).
// Exercises the real, unmocked InventoryService.listLowStock against a real
// database — the actual "onHand - reserved < lowStockThreshold" arithmetic
// runs as raw SQL (Prisma's declarative filters can't express a
// column-to-column comparison), which a mocked $queryRaw in
// inventory.service.spec.ts can't verify at all. This file is exactly
// where that arithmetic, and its boundary cases, are actually exercised.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InventoryService } from "./inventory.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import {
  startTestDatabase,
  stopTestDatabase,
  type TestDatabase,
} from "../test/testcontainers-postgres.ts";
import { seedShopFixture, seedVariant, type ShopFixture } from "../test/fixtures.ts";

describe("InventoryService.listLowStock — real Postgres", () => {
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

  // seedVariant always creates onHand: 100, reserved: 0, lowStockThreshold:
  // unset — this updates the InventoryItem it created to whatever exact
  // state a given boundary case needs, rather than duplicating
  // product/variant/inventory-item creation here.
  async function seedCandidate(options: {
    onHand: number;
    reserved?: number;
    tracksStock?: boolean;
    lowStockThreshold?: number | null;
  }): Promise<string> {
    const variant = await seedVariant(db.prisma, shop.taxClassId, {
      tracksStock: options.tracksStock ?? true,
    });
    await db.prisma.inventoryItem.update({
      where: { id: variant.inventoryItemId },
      data: {
        onHand: options.onHand,
        reserved: options.reserved ?? 0,
        lowStockThreshold: options.lowStockThreshold ?? null,
      },
    });
    return variant.variantId;
  }

  function findByVariantId(page: { items: { variantId: string }[] }, variantId: string) {
    return page.items.find((item) => item.variantId === variantId);
  }

  it("flags an item below its threshold", async () => {
    const variantId = await seedCandidate({ onHand: 2, reserved: 0, lowStockThreshold: 5 });

    const result = await service.listLowStock(1, 50);

    expect(findByVariantId(result, variantId)).toBeDefined();
  });

  it("does NOT flag an item exactly at its threshold (strict less-than, not less-or-equal)", async () => {
    const variantId = await seedCandidate({ onHand: 5, reserved: 0, lowStockThreshold: 5 });

    const result = await service.listLowStock(1, 50);

    expect(findByVariantId(result, variantId)).toBeUndefined();
  });

  it("flags an item exactly one unit below its threshold", async () => {
    const variantId = await seedCandidate({ onHand: 4, reserved: 0, lowStockThreshold: 5 });

    const result = await service.listLowStock(1, 50);

    expect(findByVariantId(result, variantId)).toBeDefined();
  });

  it("does NOT flag an item with no lowStockThreshold set, regardless of onHand", async () => {
    const variantId = await seedCandidate({ onHand: 0, reserved: 0, lowStockThreshold: null });

    const result = await service.listLowStock(1, 50);

    expect(findByVariantId(result, variantId)).toBeUndefined();
  });

  it("does NOT flag a made-to-order item (tracksStock: false), regardless of onHand/threshold", async () => {
    const variantId = await seedCandidate({
      onHand: 0,
      reserved: 0,
      tracksStock: false,
      lowStockThreshold: 5,
    });

    const result = await service.listLowStock(1, 50);

    expect(findByVariantId(result, variantId)).toBeUndefined();
  });

  it("flags an item with negative availability (oversold: reserved > onHand)", async () => {
    const variantId = await seedCandidate({ onHand: 2, reserved: 5, lowStockThreshold: 1 });

    const result = await service.listLowStock(1, 50);

    const item = findByVariantId(result, variantId);
    expect(item).toBeDefined();
    expect(item).toMatchObject({ onHand: 2, reserved: 5, availableQuantity: -3 });
  });

  it("does NOT flag a well-stocked item", async () => {
    const variantId = await seedCandidate({ onHand: 100, reserved: 0, lowStockThreshold: 5 });

    const result = await service.listLowStock(1, 50);

    expect(findByVariantId(result, variantId)).toBeUndefined();
  });

  it("returns the full admin inventory item shape, not a stripped-down alert-only shape", async () => {
    const variantId = await seedCandidate({ onHand: 1, reserved: 0, lowStockThreshold: 5 });

    const result = await service.listLowStock(1, 50);
    const item = findByVariantId(result, variantId);

    expect(item).toMatchObject({
      variantId,
      sku: expect.any(String),
      productName: expect.any(String),
      onHand: 1,
      reserved: 0,
      available: true,
      availableQuantity: 1,
      tracksStock: true,
      isLimitedEdition: false,
      productionTimeDays: null,
      lowStockThreshold: 5,
    });
  });

  it("orders the most urgent (lowest available quantity) first, correctly paginated", async () => {
    // Extreme, unmistakably-most-negative available quantities — this
    // orders ahead of anything any other test in this file could have
    // created, so the assertion is exact without needing to isolate a
    // fresh database per test.
    const variantIds = [
      await seedCandidate({ onHand: 0, reserved: 1_000_000, lowStockThreshold: 1 }),
      await seedCandidate({ onHand: 0, reserved: 2_000_000, lowStockThreshold: 1 }),
      await seedCandidate({ onHand: 0, reserved: 3_000_000, lowStockThreshold: 1 }),
    ];

    const page1 = await service.listLowStock(1, 2);
    expect(page1.items.map((item) => item.variantId)).toEqual([variantIds[2], variantIds[1]]);

    const page2 = await service.listLowStock(2, 2);
    expect(page2.items[0]?.variantId).toBe(variantIds[0]);
  });

  it("total reflects the real row count, not a mocked/stale value", async () => {
    const before = await service.listLowStock(1, 1);
    await seedCandidate({ onHand: 0, reserved: 0, lowStockThreshold: 5 });
    await seedCandidate({ onHand: 0, reserved: 0, lowStockThreshold: 5 });
    const after = await service.listLowStock(1, 1);

    expect(after.total).toBe(before.total + 2);
  });
});
