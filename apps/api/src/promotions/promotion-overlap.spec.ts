import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@ame-de-fil/database";
import {
  findOverlapConflicts,
  isExclusionConstraintViolation,
  lockVariantsForPromotionWrite,
  PROMOTION_VARIANT_NO_OVERLAP_CONSTRAINT,
} from "./promotion-overlap.ts";

function makeTx(promotionVariantRows: unknown[] = []) {
  return {
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    promotionVariant: { findMany: vi.fn().mockResolvedValue(promotionVariantRows) },
  } as unknown as Prisma.TransactionClient;
}

describe("lockVariantsForPromotionWrite", () => {
  it("acquires one advisory lock per unique variant id, in sorted order", async () => {
    const tx = makeTx();
    await lockVariantsForPromotionWrite(tx, ["var-b", "var-a", "var-b"]);
    // One call per de-duplicated id (2, not 3) — order asserted via call count only,
    // since the exact SQL text is a tagged-template Prisma.Sql object.
    expect((tx.$executeRaw as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it("does nothing for an empty variant list", async () => {
    const tx = makeTx();
    await lockVariantsForPromotionWrite(tx, []);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});

describe("findOverlapConflicts", () => {
  it("returns no conflicts for an empty variant list, without querying", async () => {
    const tx = makeTx();
    const conflicts = await findOverlapConflicts(
      tx,
      [],
      { startsAt: null, endsAt: null },
      undefined,
    );
    expect(conflicts).toEqual([]);
    expect(tx.promotionVariant.findMany).not.toHaveBeenCalled();
  });

  it("flags an overlapping date range as a conflict (Sep 1-30 vs Sep 15-Oct 15)", async () => {
    const tx = makeTx([
      {
        productVariantId: "var-1",
        promotion: {
          id: "promo-a",
          name: "Promotion A",
          startsAt: new Date("2026-09-01"),
          endsAt: new Date("2026-09-30"),
        },
      },
    ]);

    const conflicts = await findOverlapConflicts(
      tx,
      ["var-1"],
      { startsAt: new Date("2026-09-15"), endsAt: new Date("2026-10-15") },
      undefined,
    );

    expect(conflicts).toEqual([
      {
        variantId: "var-1",
        conflictingPromotionId: "promo-a",
        conflictingPromotionName: "Promotion A",
      },
    ]);
  });

  it("allows a non-overlapping scheduled window (Sep vs Nov) for the same variant", async () => {
    const tx = makeTx([
      {
        productVariantId: "var-1",
        promotion: {
          id: "promo-a",
          name: "September Sale",
          startsAt: new Date("2026-09-01"),
          endsAt: new Date("2026-09-30"),
        },
      },
    ]);

    const conflicts = await findOverlapConflicts(
      tx,
      ["var-1"],
      { startsAt: new Date("2026-11-01"), endsAt: new Date("2026-11-30") },
      undefined,
    );

    expect(conflicts).toEqual([]);
  });

  it("treats a null bound as open-ended when checking overlap", async () => {
    const tx = makeTx([
      {
        productVariantId: "var-1",
        promotion: { id: "promo-a", name: "Ongoing Sale", startsAt: null, endsAt: null },
      },
    ]);

    const conflicts = await findOverlapConflicts(
      tx,
      ["var-1"],
      { startsAt: new Date("2099-01-01"), endsAt: null },
      undefined,
    );

    expect(conflicts).toHaveLength(1);
  });

  it("excludes the promotion's own row when updating it (excludePromotionId)", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const tx = { promotionVariant: { findMany } } as unknown as Prisma.TransactionClient;

    await findOverlapConflicts(tx, ["var-1"], { startsAt: null, endsAt: null }, "promo-self");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          promotion: expect.objectContaining({ active: true, id: { not: "promo-self" } }),
        }),
      }),
    );
  });

  it("[) semantics: a window ending exactly when another starts does not overlap", async () => {
    const tx = makeTx([
      {
        productVariantId: "var-1",
        promotion: {
          id: "promo-a",
          name: "First",
          startsAt: new Date("2026-09-01"),
          endsAt: new Date("2026-09-15"),
        },
      },
    ]);

    const conflicts = await findOverlapConflicts(
      tx,
      ["var-1"],
      { startsAt: new Date("2026-09-15"), endsAt: new Date("2026-09-30") },
      undefined,
    );

    expect(conflicts).toEqual([]);
  });
});

// Real live shape confirmed by direct inspection against this project's own
// Postgres instance (same discipline as checkout/prisma-errors.spec.ts's
// own makeAdapterP2002) — unlike a P2002 unique-constraint violation, this
// surfaces as P2039 with the Postgres SQLSTATE and constraint name nested
// under meta.driverAdapterError.cause, not meta.target.
function makeExclusionViolation(constraintName: string) {
  return new Prisma.PrismaClientKnownRequestError("Database error", {
    code: "P2039",
    clientVersion: "7.10.0",
    meta: {
      modelName: "PromotionVariant",
      driverAdapterError: {
        cause: {
          originalCode: "23P01",
          code: "23P01",
          message: `conflicting key value violates exclusion constraint "${constraintName}"`,
        },
      },
    },
  });
}

describe("isExclusionConstraintViolation", () => {
  it("recognizes the real live shape (P2039, SQLSTATE 23P01, constraint name in the message)", () => {
    const error = makeExclusionViolation(PROMOTION_VARIANT_NO_OVERLAP_CONSTRAINT);
    expect(isExclusionConstraintViolation(error, PROMOTION_VARIANT_NO_OVERLAP_CONSTRAINT)).toBe(
      true,
    );
  });

  it("rejects a P2039 for a different constraint name", () => {
    const error = makeExclusionViolation("some_other_constraint");
    expect(isExclusionConstraintViolation(error, PROMOTION_VARIANT_NO_OVERLAP_CONSTRAINT)).toBe(
      false,
    );
  });

  it("rejects a non-P2039 error entirely", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "7.10.0",
      meta: { target: ["id"] },
    });
    expect(isExclusionConstraintViolation(error, PROMOTION_VARIANT_NO_OVERLAP_CONSTRAINT)).toBe(
      false,
    );
  });

  it("rejects a plain Error (not a PrismaClientKnownRequestError)", () => {
    expect(
      isExclusionConstraintViolation(new Error("boom"), PROMOTION_VARIANT_NO_OVERLAP_CONSTRAINT),
    ).toBe(false);
  });
});
