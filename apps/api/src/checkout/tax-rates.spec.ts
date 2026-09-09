import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@ame-de-fil/database";
import { getCurrentTaxRatesByClassId, getShippingTaxRatePercent } from "./tax-rates.ts";

function decimal(value: number) {
  return { toNumber: () => value };
}

describe("getCurrentTaxRatesByClassId", () => {
  it("returns an empty map for an empty input without querying", async () => {
    const findMany = vi.fn();
    const tx = { taxRate: { findMany } } as unknown as Prisma.TransactionClient;

    const result = await getCurrentTaxRatesByClassId(tx, [], new Date());

    expect(result.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("picks the most recent currently-valid rate per tax class", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { taxClassId: "tc-1", ratePercent: decimal(25) }, // most recent (query orders desc)
      { taxClassId: "tc-1", ratePercent: decimal(20) }, // older, must be ignored
      { taxClassId: "tc-2", ratePercent: decimal(12) },
    ]);
    const tx = { taxRate: { findMany } } as unknown as Prisma.TransactionClient;

    const result = await getCurrentTaxRatesByClassId(tx, ["tc-1", "tc-2", "tc-1"], new Date());

    expect(result.get("tc-1")).toBe(25);
    expect(result.get("tc-2")).toBe(12);
  });

  it("throws when a tax class has no currently-valid rate", async () => {
    const findMany = vi.fn().mockResolvedValue([{ taxClassId: "tc-1", ratePercent: decimal(25) }]);
    const tx = { taxRate: { findMany } } as unknown as Prisma.TransactionClient;

    await expect(getCurrentTaxRatesByClassId(tx, ["tc-1", "tc-2"], new Date())).rejects.toThrow(
      /tc-2/,
    );
  });
});

describe("getShippingTaxRatePercent", () => {
  it("looks up the STANDARD tax class's current rate", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "tc-standard", code: "STANDARD" });
    const findMany = vi
      .fn()
      .mockResolvedValue([{ taxClassId: "tc-standard", ratePercent: decimal(25) }]);
    const tx = {
      taxClass: { findUnique },
      taxRate: { findMany },
    } as unknown as Prisma.TransactionClient;

    const rate = await getShippingTaxRatePercent(tx, new Date());

    expect(findUnique).toHaveBeenCalledWith({ where: { code: "STANDARD" } });
    expect(rate).toBe(25);
  });

  it("throws when the STANDARD tax class doesn't exist", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const tx = { taxClass: { findUnique } } as unknown as Prisma.TransactionClient;

    await expect(getShippingTaxRatePercent(tx, new Date())).rejects.toThrow(/STANDARD/);
  });
});
