import { describe, expect, it, vi } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { InventoryService } from "./inventory.service.ts";
import type { PrismaService } from "../database/prisma.service.ts";
import { Locale } from "@ame-de-fil/database";
import { AuditService } from "../audit/audit.service.ts";

const BASE_ITEM = {
  id: "inv-1",
  productVariantId: "var-1",
  onHand: 10,
  reserved: 2,
  tracksStock: true,
  productionTimeDays: null,
  isLimitedEdition: false,
  lowStockThreshold: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function withContext(overrides: Partial<typeof BASE_ITEM> = {}) {
  return {
    ...BASE_ITEM,
    ...overrides,
    variant: {
      id: "var-1",
      sku: "SKU-1",
      product: {
        translations: [{ locale: Locale.sv_SE, name: "Halsduk" }],
      },
    },
  };
}

// $transaction's callback receives `tx`, which here is just the same mock
// object again — every inventoryItem/inventoryMovement call the service
// makes inside the transaction resolves against these same mocks.
function makePrisma(overrides: Partial<ReturnType<typeof baseMock>> = {}) {
  const mock = { ...baseMock(), ...overrides };
  mock.$transaction = vi
    .fn()
    .mockImplementation((callback: (tx: unknown) => unknown) => callback(mock));
  return mock as unknown as PrismaService;
}

function baseMock() {
  return {
    inventoryItem: {
      findMany: vi.fn().mockResolvedValue([withContext()]),
      count: vi.fn().mockResolvedValue(1),
      findUnique: vi.fn().mockResolvedValue(withContext()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(withContext({ onHand: 15 })),
    },
    inventoryMovement: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "mov-1" }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  };
}

describe("InventoryService.list", () => {
  it("maps rows with computed availability and pagination metadata", async () => {
    const prisma = makePrisma();
    const service = new InventoryService(prisma, new AuditService(prisma));

    const result = await service.list(1, 20);

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      variantId: "var-1",
      sku: "SKU-1",
      productName: "Halsduk",
      onHand: 10,
      reserved: 2,
      available: true,
      availableQuantity: 8,
    });
  });
});

// The actual low-stock WHERE-clause arithmetic (tracksStock/
// lowStockThreshold/onHand-reserved boundary cases) runs as raw SQL a
// mocked $queryRaw can't meaningfully exercise — those are covered by
// inventory.service.integration.spec.ts against real Postgres instead.
// These tests cover the service's own plumbing: pagination pass-through,
// the empty-page short circuit, and re-sorting the shaping query's result
// back into the raw query's own urgency order.
describe("InventoryService.listLowStock", () => {
  it("re-sorts the shaping query's rows back into the raw query's urgency order", async () => {
    const prisma = makePrisma();
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ count: 2 }]) // count query
      .mockResolvedValueOnce([{ id: "inv-2" }, { id: "inv-1" }]); // ids query, in urgency order
    const rowFor = (id: string, sku: string) => ({
      id,
      onHand: 1,
      reserved: 0,
      tracksStock: true,
      isLimitedEdition: false,
      productionTimeDays: null,
      lowStockThreshold: 5,
      variant: { id: `var-${sku}`, sku, product: { translations: [{ locale: Locale.sv_SE, name: sku }] } },
    });
    // findMany intentionally returns them in the OPPOSITE order — Prisma's
    // `id IN (...)` never guarantees result order.
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      rowFor("inv-1", "SKU-1"),
      rowFor("inv-2", "SKU-2"),
    ] as never);
    const service = new InventoryService(prisma, new AuditService(prisma));

    const result = await service.listLowStock(1, 20);

    expect(result.items.map((item) => item.sku)).toEqual(["SKU-2", "SKU-1"]);
    expect(result.total).toBe(2);
    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["inv-2", "inv-1"] } },
      select: expect.any(Object),
    });
  });

  it("returns an empty page without querying the shaping select when nothing is low on stock", async () => {
    const prisma = makePrisma();
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([]);
    const service = new InventoryService(prisma, new AuditService(prisma));

    const result = await service.listLowStock(1, 20);

    expect(result).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
    expect(prisma.inventoryItem.findMany).not.toHaveBeenCalled();
  });

  it("computes pagination consistently with the other list endpoint", async () => {
    const prisma = makePrisma();
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([]);
    const service = new InventoryService(prisma, new AuditService(prisma));

    const result = await service.listLowStock(3, 10);

    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(10);
  });
});

describe("InventoryService.getByVariantId", () => {
  it("throws NotFoundException for an unknown variant", async () => {
    const prisma = makePrisma({
      inventoryItem: { ...baseMock().inventoryItem, findUnique: vi.fn().mockResolvedValue(null) },
    });
    const service = new InventoryService(prisma, new AuditService(prisma));

    await expect(service.getByVariantId("missing")).rejects.toThrow(NotFoundException);
  });

  it("returns the item with recent movement history", async () => {
    const prisma = makePrisma({
      inventoryMovement: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "mov-1",
            type: "RESTOCK",
            quantity: 5,
            reason: "New shipment",
            createdByUserId: "user-1",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ]),
        create: vi.fn(),
      },
    });
    const service = new InventoryService(prisma, new AuditService(prisma));

    const result = await service.getByVariantId("var-1");

    expect(result.movements).toEqual([
      expect.objectContaining({ id: "mov-1", type: "RESTOCK", quantity: 5 }),
    ]);
  });
});

describe("InventoryService.adjustStock", () => {
  it("throws NotFoundException for an unknown variant", async () => {
    const prisma = makePrisma({
      inventoryItem: { ...baseMock().inventoryItem, findUnique: vi.fn().mockResolvedValue(null) },
    });
    const service = new InventoryService(prisma, new AuditService(prisma));

    await expect(
      service.adjustStock("missing", { delta: 5, reason: "restock", type: "RESTOCK" }, "user-1"),
    ).rejects.toThrow(NotFoundException);
  });

  it("applies a positive delta and records a movement", async () => {
    const prisma = makePrisma();
    const service = new InventoryService(prisma, new AuditService(prisma));

    const result = await service.adjustStock(
      "var-1",
      { delta: 5, reason: "New shipment", type: "RESTOCK" },
      "user-1",
    );

    expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { onHand: { increment: 5 } },
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        inventoryItemId: "inv-1",
        type: "RESTOCK",
        quantity: 5,
        reason: "New shipment",
        createdByUserId: "user-1",
      },
    });
    expect(result.onHand).toBe(15);
  });

  it("folds the not-negative guard into the same atomic update as a negative delta", async () => {
    const prisma = makePrisma();
    const service = new InventoryService(prisma, new AuditService(prisma));

    await service.adjustStock(
      "var-1",
      { delta: -3, reason: "Damaged", type: "ADJUSTMENT" },
      "user-1",
    );

    expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", onHand: { gte: 3 } },
      data: { onHand: { increment: -3 } },
    });
  });

  it("throws BadRequestException when the guarded update matches zero rows (would go negative, or lost a race)", async () => {
    const prisma = makePrisma({
      inventoryItem: {
        ...baseMock().inventoryItem,
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    });
    const service = new InventoryService(prisma, new AuditService(prisma));

    await expect(
      service.adjustStock(
        "var-1",
        { delta: -100, reason: "Damaged", type: "ADJUSTMENT" },
        "user-1",
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
  });
});
