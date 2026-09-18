import { describe, expect, it } from "vitest";
import { createPromotionSchema } from "./create-promotion.dto.ts";

const BASE = {
  name: "Autumn Sale",
  percentage: 20,
  variantIds: ["var-1"],
};

describe("createPromotionSchema", () => {
  it("accepts a minimal valid promotion and defaults active to true", () => {
    const result = createPromotionSchema.parse(BASE);
    expect(result.active).toBe(true);
  });

  it("accepts explicit startsAt/endsAt as ISO strings", () => {
    const result = createPromotionSchema.parse({
      ...BASE,
      startsAt: "2026-09-01T00:00:00.000Z",
      endsAt: "2026-09-30T00:00:00.000Z",
    });
    expect(result.startsAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it.each([0, -1, -20])("rejects a percentage of %d", (percentage) => {
    expect(createPromotionSchema.safeParse({ ...BASE, percentage }).success).toBe(false);
  });

  it("rejects a percentage over 100", () => {
    expect(createPromotionSchema.safeParse({ ...BASE, percentage: 101 }).success).toBe(false);
  });

  it("rejects a non-integer percentage", () => {
    expect(createPromotionSchema.safeParse({ ...BASE, percentage: 20.5 }).success).toBe(false);
  });

  it("rejects NaN/non-numeric percentage input", () => {
    expect(createPromotionSchema.safeParse({ ...BASE, percentage: Number.NaN }).success).toBe(
      false,
    );
    expect(createPromotionSchema.safeParse({ ...BASE, percentage: "20" }).success).toBe(false);
  });

  it("accepts the boundary values 1 and 100", () => {
    expect(createPromotionSchema.safeParse({ ...BASE, percentage: 1 }).success).toBe(true);
    expect(createPromotionSchema.safeParse({ ...BASE, percentage: 100 }).success).toBe(true);
  });

  it("rejects an empty variantIds array", () => {
    expect(createPromotionSchema.safeParse({ ...BASE, variantIds: [] }).success).toBe(false);
  });

  it("rejects a blank name", () => {
    expect(createPromotionSchema.safeParse({ ...BASE, name: "  " }).success).toBe(false);
  });

  it("rejects endsAt at or before startsAt", () => {
    const result = createPromotionSchema.safeParse({
      ...BASE,
      startsAt: "2026-09-30T00:00:00.000Z",
      endsAt: "2026-09-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a promotion with only one of startsAt/endsAt set", () => {
    expect(
      createPromotionSchema.safeParse({ ...BASE, startsAt: "2026-09-01T00:00:00.000Z" }).success,
    ).toBe(true);
    expect(
      createPromotionSchema.safeParse({ ...BASE, endsAt: "2026-09-30T00:00:00.000Z" }).success,
    ).toBe(true);
  });
});
