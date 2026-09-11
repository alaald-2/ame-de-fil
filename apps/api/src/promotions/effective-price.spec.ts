import { describe, expect, it, vi } from "vitest";
import {
  computeEffectivePriceMinor,
  isPromotionCurrentlyEffective,
  resolveActivePromotionsForVariants,
  resolveEffectivePrice,
} from "./effective-price.ts";
import type { PrismaService } from "../database/prisma.service.ts";

describe("computeEffectivePriceMinor", () => {
  it("computes the standard case: 500 kr at 20% off -> 400 kr", () => {
    expect(computeEffectivePriceMinor(50000, 20)).toBe(40000);
  });

  it("rounds to the nearest minor unit deterministically", () => {
    // 29900 * (100-33)/100 = 20033.0 -> exact, no rounding drama.
    expect(computeEffectivePriceMinor(29900, 33)).toBe(20033);
    // 10000 * 67/100 = 6700 exact; 10000 * 33/100 = 3300 exact. Pick a case
    // that actually lands on a half-cent to prove Math.round's own
    // round-half-away-from-zero-for-positives behavior is what's used:
    // 100001 * (100-1)/100 = 99000.99 -> 99001.
    expect(computeEffectivePriceMinor(100001, 1)).toBe(99001);
  });

  it("never goes negative, and 100% off lands on exactly 0", () => {
    expect(computeEffectivePriceMinor(50000, 100)).toBe(0);
  });

  it("a 1% discount still reduces the price", () => {
    expect(computeEffectivePriceMinor(50000, 1)).toBe(49500);
  });
});

describe("isPromotionCurrentlyEffective", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");

  it("is effective when active with no date bounds at all", () => {
    expect(isPromotionCurrentlyEffective({ active: true, startsAt: null, endsAt: null }, now)).toBe(
      true,
    );
  });

  it("is not effective when inactive, regardless of dates", () => {
    expect(
      isPromotionCurrentlyEffective(
        { active: false, startsAt: null, endsAt: null },
        now,
      ),
    ).toBe(false);
  });

  it("is not effective before its startsAt", () => {
    expect(
      isPromotionCurrentlyEffective(
        { active: true, startsAt: new Date("2026-09-16"), endsAt: null },
        now,
      ),
    ).toBe(false);
  });

  it("is effective exactly at startsAt (inclusive start)", () => {
    expect(
      isPromotionCurrentlyEffective(
        { active: true, startsAt: now, endsAt: null },
        now,
      ),
    ).toBe(true);
  });

  it("is not effective at or after endsAt (exclusive end)", () => {
    expect(
      isPromotionCurrentlyEffective({ active: true, startsAt: null, endsAt: now }, now),
    ).toBe(false);
    expect(
      isPromotionCurrentlyEffective(
        { active: true, startsAt: null, endsAt: new Date(now.getTime() - 1) },
        now,
      ),
    ).toBe(false);
  });

  it("is effective just before endsAt", () => {
    expect(
      isPromotionCurrentlyEffective(
        { active: true, startsAt: null, endsAt: new Date(now.getTime() + 1) },
        now,
      ),
    ).toBe(true);
  });
});

describe("resolveEffectivePrice", () => {
  it("returns the base price unchanged, with no promotion, when none is given", () => {
    const result = resolveEffectivePrice(50000, undefined);
    expect(result).toEqual({ basePriceMinor: 50000, effectivePriceMinor: 50000, promotion: null });
  });

  it("returns the discounted price and the promotion when one is given", () => {
    const promotion = { id: "promo-1", name: "Autumn Sale", percentage: 20 };
    const result = resolveEffectivePrice(50000, promotion);
    expect(result).toEqual({ basePriceMinor: 50000, effectivePriceMinor: 40000, promotion });
  });
});

describe("resolveActivePromotionsForVariants", () => {
  it("returns an empty map without querying when given no variant ids", async () => {
    const findMany = vi.fn();
    const client = { promotionVariant: { findMany } } as unknown as PrismaService;

    const result = await resolveActivePromotionsForVariants(client, [], new Date());

    expect(result.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("includes only currently-effective rows, keyed by variant id", async () => {
    const now = new Date("2026-09-15");
    const findMany = vi.fn().mockResolvedValue([
      {
        productVariantId: "var-1",
        promotion: { id: "promo-1", name: "Live", percentage: 10, active: true, startsAt: null, endsAt: null },
      },
      {
        productVariantId: "var-2",
        promotion: {
          id: "promo-2",
          name: "Future",
          percentage: 15,
          active: true,
          startsAt: new Date("2099-01-01"),
          endsAt: null,
        },
      },
    ]);
    const client = { promotionVariant: { findMany } } as unknown as PrismaService;

    const result = await resolveActivePromotionsForVariants(client, ["var-1", "var-2"], now);

    expect(result.get("var-1")).toEqual({ id: "promo-1", name: "Live", percentage: 10 });
    expect(result.has("var-2")).toBe(false);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productVariantId: { in: ["var-1", "var-2"] }, promotion: { active: true } },
      }),
    );
  });

  it("de-duplicates variant ids before querying", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const client = { promotionVariant: { findMany } } as unknown as PrismaService;

    await resolveActivePromotionsForVariants(client, ["var-1", "var-1", "var-1"], new Date());

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ productVariantId: { in: ["var-1"] } }) }),
    );
  });
});
