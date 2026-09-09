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
};

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
    });
    expect(txFindUnique).toHaveBeenCalledWith({ where: { id: "ship-1" } });
    expect(prisma.shippingMethod.findUnique).not.toHaveBeenCalled();
  });
});
