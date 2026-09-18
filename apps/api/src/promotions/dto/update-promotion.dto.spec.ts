import { describe, expect, it } from "vitest";
import { updatePromotionSchema } from "./update-promotion.dto.ts";

describe("updatePromotionSchema", () => {
  it("accepts an empty object — every field is optional", () => {
    expect(updatePromotionSchema.safeParse({}).success).toBe(true);
  });

  it("accepts active alone (deactivate/activate via PATCH)", () => {
    const result = updatePromotionSchema.parse({ active: false });
    expect(result).toEqual({ active: false });
  });

  it("accepts explicit null to clear startsAt/endsAt", () => {
    const result = updatePromotionSchema.parse({ startsAt: null, endsAt: null });
    expect(result.startsAt).toBeNull();
    expect(result.endsAt).toBeNull();
  });

  it("rejects an out-of-range percentage", () => {
    expect(updatePromotionSchema.safeParse({ percentage: 0 }).success).toBe(false);
    expect(updatePromotionSchema.safeParse({ percentage: 101 }).success).toBe(false);
  });

  it("rejects endsAt at or before startsAt when both are given in the same request", () => {
    const result = updatePromotionSchema.safeParse({
      startsAt: "2026-09-30T00:00:00.000Z",
      endsAt: "2026-09-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("does not reject a single-sided date change — that's the service's job once merged with the existing value", () => {
    // Only the service (promotions.service.ts's update()) knows the
    // existing stored value for the side not included here.
    expect(updatePromotionSchema.safeParse({ endsAt: "2020-01-01T00:00:00.000Z" }).success).toBe(
      true,
    );
  });

  it("rejects an empty variantIds array when provided", () => {
    expect(updatePromotionSchema.safeParse({ variantIds: [] }).success).toBe(false);
  });
});
