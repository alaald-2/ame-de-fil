import { describe, expect, it, vi } from "vitest";
import { ManualShippingProvider } from "./shipping-provider.ts";
import type { PrismaService } from "../database/prisma.service.ts";
import type { Prisma } from "@ame-de-fil/database";

const ROW = {
  id: "ship-1",
  code: "STANDARD",
  nameSv: "Standardfrakt",
  nameEn: "Standard shipping",
  priceMinor: 4900,
  minDeliveryDays: 2,
  maxDeliveryDays: 5,
  isActive: true,
  requiresPickupPoint: false,
};

const PICKUP_ROW = { ...ROW, id: "ship-2", code: "OMBUD", requiresPickupPoint: true };

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    shippingMethod: {
      findMany: vi.fn().mockResolvedValue([ROW]),
      findUnique: vi.fn().mockResolvedValue(ROW),
    },
    ...overrides,
  } as unknown as PrismaService;
}

describe("ManualShippingProvider.listAvailableMethods", () => {
  it("only returns active methods, mapped to the ShippingQuote shape", async () => {
    const prisma = makePrisma();
    const provider = new ManualShippingProvider(prisma);

    const quotes = await provider.listAvailableMethods();

    expect(prisma.shippingMethod.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
    expect(quotes).toEqual([
      {
        shippingMethodId: "ship-1",
        code: "STANDARD",
        nameSv: "Standardfrakt",
        nameEn: "Standard shipping",
        priceMinor: 4900,
        currency: "SEK",
        minDeliveryDays: 2,
        maxDeliveryDays: 5,
        requiresPickupPoint: false,
      },
    ]);
  });
});

describe("ManualShippingProvider.getQuote", () => {
  it("returns null for a nonexistent method", async () => {
    const prisma = makePrisma({
      shippingMethod: { findMany: vi.fn(), findUnique: vi.fn().mockResolvedValue(null) },
    });
    const provider = new ManualShippingProvider(prisma);

    const quote = await provider.getQuote(prisma as unknown as Prisma.TransactionClient, "missing");

    expect(quote).toBeNull();
  });

  it("returns null for a deactivated method — a customer can't check out with a stale selection", async () => {
    const prisma = makePrisma({
      shippingMethod: {
        findMany: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({ ...ROW, isActive: false }),
      },
    });
    const provider = new ManualShippingProvider(prisma);

    const quote = await provider.getQuote(prisma as unknown as Prisma.TransactionClient, "ship-1");

    expect(quote).toBeNull();
  });

  it("returns the quote for an active method, read through the given transaction client — not this.prisma", async () => {
    // A distinct mock from the constructor's own PrismaService, so a passing
    // test proves getQuote actually used the `tx` argument.
    const prisma = makePrisma({
      shippingMethod: { findMany: vi.fn(), findUnique: vi.fn().mockResolvedValue(null) },
    });
    const provider = new ManualShippingProvider(prisma);
    const txFindUnique = vi.fn().mockResolvedValue(ROW);
    const tx = {
      shippingMethod: { findUnique: txFindUnique },
    } as unknown as Prisma.TransactionClient;

    const quote = await provider.getQuote(tx, "ship-1");

    expect(quote).toEqual({
      shippingMethodId: "ship-1",
      code: "STANDARD",
      nameSv: "Standardfrakt",
      nameEn: "Standard shipping",
      priceMinor: 4900,
      currency: "SEK",
      minDeliveryDays: 2,
      maxDeliveryDays: 5,
      requiresPickupPoint: false,
    });
    expect(txFindUnique).toHaveBeenCalledWith({ where: { id: "ship-1" } });
    expect(prisma.shippingMethod.findUnique).not.toHaveBeenCalled();
  });
});

describe("ManualShippingProvider.listPickupPoints", () => {
  it("returns an empty array for a method that doesn't require a pickup point", async () => {
    const prisma = makePrisma({
      shippingMethod: { findUnique: vi.fn().mockResolvedValue(ROW) },
    });
    const provider = new ManualShippingProvider(prisma);

    const points = await provider.listPickupPoints("ship-1", "11122");

    expect(points).toEqual([]);
  });

  it("returns fixture pickup points for a method that requires one", async () => {
    const prisma = makePrisma({
      shippingMethod: { findUnique: vi.fn().mockResolvedValue(PICKUP_ROW) },
    });
    const provider = new ManualShippingProvider(prisma);

    const points = await provider.listPickupPoints("ship-2", "11122");

    expect(points.length).toBeGreaterThan(0);
    expect(points[0]).toMatchObject({ postalCode: "11122" });
  });

  it("returns an empty array for a deactivated method", async () => {
    const prisma = makePrisma({
      shippingMethod: { findUnique: vi.fn().mockResolvedValue({ ...PICKUP_ROW, isActive: false }) },
    });
    const provider = new ManualShippingProvider(prisma);

    const points = await provider.listPickupPoints("ship-2", "11122");

    expect(points).toEqual([]);
  });
});

describe("ManualShippingProvider.getPickupPoint", () => {
  it("returns null for a method that doesn't require a pickup point", async () => {
    const prisma = makePrisma();
    const provider = new ManualShippingProvider(prisma);
    const tx = { shippingMethod: { findUnique: vi.fn().mockResolvedValue(ROW) } } as unknown as Prisma.TransactionClient;

    const point = await provider.getPickupPoint(tx, "ship-1", "anything", "11122");

    expect(point).toBeNull();
  });

  it("returns the matching fixture point for a valid id, read through the given transaction client", async () => {
    const prisma = makePrisma({ shippingMethod: { findUnique: vi.fn().mockResolvedValue(PICKUP_ROW) } });
    const provider = new ManualShippingProvider(prisma);
    const txFindUnique = vi.fn().mockResolvedValue(PICKUP_ROW);
    const tx = { shippingMethod: { findUnique: txFindUnique } } as unknown as Prisma.TransactionClient;

    const [first] = await provider.listPickupPoints("ship-2", "11122");
    const point = await provider.getPickupPoint(tx, "ship-2", first!.id, "11122");

    expect(point).toEqual(first);
    expect(txFindUnique).toHaveBeenCalledWith({ where: { id: "ship-2" } });
  });

  it("returns null for an id that doesn't match any fixture point", async () => {
    const prisma = makePrisma();
    const provider = new ManualShippingProvider(prisma);
    const tx = {
      shippingMethod: { findUnique: vi.fn().mockResolvedValue(PICKUP_ROW) },
    } as unknown as Prisma.TransactionClient;

    const point = await provider.getPickupPoint(tx, "ship-2", "not-a-real-id", "11122");

    expect(point).toBeNull();
  });
});

describe("ManualShippingProvider.createShipment", () => {
  it("always returns null — no external carrier exists to create anything at (ADR-022)", async () => {
    const provider = new ManualShippingProvider(makePrisma());

    const result = await provider.createShipment(
      "ship-1",
      {
        postalCode: "11122",
        country: "SE",
        city: "Stockholm",
        name: "Test Testsson",
        line1: "Testgatan 1",
      },
      { weightGrams: 500 },
      "AF-TEST-1",
    );

    expect(result).toBeNull();
  });
});
