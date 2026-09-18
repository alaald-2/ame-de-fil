import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ame-de-fil/database";
import { PromotionsService } from "./promotions.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import type { PrismaService } from "../database/prisma.service.ts";
import type { CreatePromotionInput } from "./dto/create-promotion.dto.ts";
import type { UpdatePromotionInput } from "./dto/update-promotion.dto.ts";
import { PROMOTION_VARIANT_NO_OVERLAP_CONSTRAINT } from "./promotion-overlap.ts";

const ACTOR_USER_ID = "user-1";

function makeExclusionViolation() {
  return new Prisma.PrismaClientKnownRequestError("Database error", {
    code: "P2039",
    clientVersion: "7.10.0",
    meta: {
      modelName: "PromotionVariant",
      driverAdapterError: {
        cause: {
          code: "23P01",
          message: `conflicting key value violates exclusion constraint "${PROMOTION_VARIANT_NO_OVERLAP_CONSTRAINT}"`,
        },
      },
    },
  });
}

function makeTxMock(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    promotionVariant: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    promotion: {
      create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => ({
        id: "promo-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...args.data,
      })),
      update: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => ({
        id: "promo-1",
        ...args.data,
      })),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

const VALID_CREATE_INPUT: CreatePromotionInput = {
  name: "Autumn Sale",
  percentage: 20,
  active: true,
  variantIds: ["var-1"],
};

describe("PromotionsService.create", () => {
  it("creates the promotion and attaches the given variants when nothing conflicts", async () => {
    const tx = makeTxMock();
    const prisma = {
      productVariant: { findMany: vi.fn().mockResolvedValue([{ id: "var-1" }]) },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new PromotionsService(prisma, new AuditService(prisma));

    const result = await service.create(VALID_CREATE_INPUT, ACTOR_USER_ID);

    expect(result.id).toBe("promo-1");
    expect(tx.promotion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Autumn Sale",
          percentage: 20,
          active: true,
          variants: {
            create: [expect.objectContaining({ productVariantId: "var-1", activeSnapshot: true })],
          },
        }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("rejects when one or more variantIds don't exist, before opening a transaction", async () => {
    const transaction = vi.fn();
    const prisma = {
      productVariant: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new PromotionsService(prisma, new AuditService(prisma));

    await expect(service.create(VALID_CREATE_INPUT, ACTOR_USER_ID)).rejects.toThrow(
      BadRequestException,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects with a clear conflict when the variant already has an overlapping active promotion", async () => {
    const tx = makeTxMock({
      promotionVariant: {
        findMany: vi.fn().mockResolvedValue([
          {
            productVariantId: "var-1",
            promotion: {
              id: "promo-existing",
              name: "Existing Sale",
              startsAt: null,
              endsAt: null,
            },
          },
        ]),
      },
    });
    const prisma = {
      productVariant: { findMany: vi.fn().mockResolvedValue([{ id: "var-1" }]) },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new PromotionsService(prisma, new AuditService(prisma));

    await expect(service.create(VALID_CREATE_INPUT, ACTOR_USER_ID)).rejects.toThrow(
      ConflictException,
    );
    expect(tx.promotion.create).not.toHaveBeenCalled();
  });

  it("skips the overlap check entirely for an inactive promotion, even with a conflicting variant", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        {
          productVariantId: "var-1",
          promotion: { id: "promo-existing", name: "Existing", startsAt: null, endsAt: null },
        },
      ]);
    const tx = makeTxMock({ promotionVariant: { findMany, deleteMany: vi.fn() } });
    const prisma = {
      productVariant: { findMany: vi.fn().mockResolvedValue([{ id: "var-1" }]) },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new PromotionsService(prisma, new AuditService(prisma));

    const result = await service.create({ ...VALID_CREATE_INPUT, active: false }, ACTOR_USER_ID);

    expect(result.id).toBe("promo-1");
    // findOverlapConflicts is never invoked for an inactive promotion —
    // the only promotionVariant.findMany call is the overlap check itself,
    // so zero calls proves it was skipped.
    expect(findMany).not.toHaveBeenCalled();
  });

  it("translates a raw exclusion-constraint violation into a clean ConflictException (defense-in-depth)", async () => {
    const tx = makeTxMock({
      promotion: {
        create: vi.fn().mockRejectedValue(makeExclusionViolation()),
      },
    });
    const prisma = {
      productVariant: { findMany: vi.fn().mockResolvedValue([{ id: "var-1" }]) },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new PromotionsService(prisma, new AuditService(prisma));

    await expect(service.create(VALID_CREATE_INPUT, ACTOR_USER_ID)).rejects.toThrow(
      ConflictException,
    );
  });
});

function existingPromotionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "promo-1",
    name: "Autumn Sale",
    percentage: 20,
    startsAt: new Date("2026-09-01"),
    endsAt: new Date("2026-09-30"),
    active: true,
    createdAt: new Date("2026-08-01"),
    updatedAt: new Date("2026-08-01"),
    variants: [{ productVariantId: "var-1" }],
    ...overrides,
  };
}

describe("PromotionsService.update", () => {
  it("404s when the promotion doesn't exist", async () => {
    const prisma = {
      promotion: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new PromotionsService(prisma, new AuditService(prisma));

    await expect(service.update("missing", {}, ACTOR_USER_ID)).rejects.toThrow(NotFoundException);
  });

  it("merges a partial update (percentage only) with the existing stored fields", async () => {
    const tx = makeTxMock();
    const prisma = {
      promotion: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(existingPromotionRow())
          .mockResolvedValueOnce({ ...existingPromotionRow({ percentage: 30 }), variants: [] }),
      },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new PromotionsService(prisma, new AuditService(prisma));

    await service.update("promo-1", { percentage: 30 } as UpdatePromotionInput, ACTOR_USER_ID);

    expect(tx.promotion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Autumn Sale", // unchanged
          percentage: 30, // changed
          active: true, // unchanged
        }),
      }),
    );
  });

  it("activate/deactivate is just `active` in the PATCH body — deactivating skips the conflict check", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const tx = makeTxMock({
      promotionVariant: { findMany, deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    });
    const prisma = {
      promotion: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(existingPromotionRow())
          .mockResolvedValueOnce({ ...existingPromotionRow({ active: false }), variants: [] }),
      },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new PromotionsService(prisma, new AuditService(prisma));

    await service.update("promo-1", { active: false } as UpdatePromotionInput, ACTOR_USER_ID);

    expect(tx.promotion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ active: false }) }),
    );
    // Locking still happens (cheap, and closes a narrow reactivation race),
    // but the overlap query itself is never run for a deactivation.
    expect(findMany).not.toHaveBeenCalled();
  });

  it("rejects a merged date range where the request only moves one side past the other's stored value", async () => {
    const prisma = {
      promotion: { findUnique: vi.fn().mockResolvedValue(existingPromotionRow()) },
    } as unknown as PrismaService;
    const service = new PromotionsService(prisma, new AuditService(prisma));

    // Existing startsAt is Sep 1 — moving endsAt to before it must be
    // rejected even though the DTO itself only saw endsAt in isolation.
    await expect(
      service.update(
        "promo-1",
        { endsAt: "2026-08-01T00:00:00.000Z" } as UpdatePromotionInput,
        ACTOR_USER_ID,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("excludes the promotion's own existing row from its own overlap check", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const tx = makeTxMock({
      promotionVariant: { findMany, deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    });
    const prisma = {
      promotion: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(existingPromotionRow())
          .mockResolvedValueOnce({ ...existingPromotionRow(), variants: [] }),
      },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new PromotionsService(prisma, new AuditService(prisma));

    await service.update("promo-1", { percentage: 25 } as UpdatePromotionInput, ACTOR_USER_ID);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          promotion: expect.objectContaining({ id: { not: "promo-1" } }),
        }),
      }),
    );
  });

  it("replaces the full variant set when variantIds is provided", async () => {
    const tx = makeTxMock();
    const prisma = {
      promotion: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(existingPromotionRow())
          .mockResolvedValueOnce({ ...existingPromotionRow(), variants: [] }),
      },
      productVariant: { findMany: vi.fn().mockResolvedValue([{ id: "var-2" }]) },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new PromotionsService(prisma, new AuditService(prisma));

    await service.update(
      "promo-1",
      { variantIds: ["var-2"] } as UpdatePromotionInput,
      ACTOR_USER_ID,
    );

    expect(tx.promotionVariant.deleteMany).toHaveBeenCalledWith({
      where: { promotionId: "promo-1" },
    });
    expect(tx.promotion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          variants: { create: [expect.objectContaining({ productVariantId: "var-2" })] },
        }),
      }),
    );
  });
});

// Feeds the Products admin page's "remove promotion" action on a single
// variant card (product-variants-form.tsx) — a thin wrapper around
// update() itself, so these tests only cover its own branching (last
// variant vs. one of several), not update()'s already-covered internals.
describe("PromotionsService.removeVariant", () => {
  it("404s when the promotion doesn't exist", async () => {
    const prisma = {
      promotion: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new PromotionsService(prisma, new AuditService(prisma));

    await expect(service.removeVariant("missing", "var-1", ACTOR_USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("404s when the promotion doesn't apply to that variant", async () => {
    const prisma = {
      promotion: {
        findUnique: vi
          .fn()
          .mockResolvedValue(existingPromotionRow({ variants: [{ productVariantId: "var-1" }] })),
      },
    } as unknown as PrismaService;
    const service = new PromotionsService(prisma, new AuditService(prisma));

    await expect(service.removeVariant("promo-1", "var-unrelated", ACTOR_USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("keeps the promotion active and drops just the one variant when others remain", async () => {
    const tx = makeTxMock();
    const prisma = {
      promotion: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(
            existingPromotionRow({
              variants: [{ productVariantId: "var-1" }, { productVariantId: "var-2" }],
            }),
          )
          // update()'s own lookup — same current state, re-read fresh.
          .mockResolvedValueOnce(
            existingPromotionRow({
              variants: [{ productVariantId: "var-1" }, { productVariantId: "var-2" }],
            }),
          )
          // getOne()'s final read, at the end of update().
          .mockResolvedValueOnce({ ...existingPromotionRow(), variants: [] }),
      },
      productVariant: { findMany: vi.fn().mockResolvedValue([{ id: "var-1" }]) },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new PromotionsService(prisma, new AuditService(prisma));

    await service.removeVariant("promo-1", "var-2", ACTOR_USER_ID);

    expect(tx.promotion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          active: true, // preserved, not touched
          variants: { create: [expect.objectContaining({ productVariantId: "var-1" })] },
        }),
      }),
    );
  });

  it("deactivates the promotion instead of leaving it variant-less when this was the last variant", async () => {
    const tx = makeTxMock();
    const prisma = {
      promotion: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(
            existingPromotionRow({ variants: [{ productVariantId: "var-1" }] }),
          )
          // update()'s own lookup — same current state, re-read fresh.
          .mockResolvedValueOnce(
            existingPromotionRow({ variants: [{ productVariantId: "var-1" }] }),
          )
          // getOne()'s final read, at the end of update().
          .mockResolvedValueOnce({ ...existingPromotionRow({ active: false }), variants: [] }),
      },
      productVariant: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new PromotionsService(prisma, new AuditService(prisma));

    await service.removeVariant("promo-1", "var-1", ACTOR_USER_ID);

    expect(tx.promotionVariant.deleteMany).toHaveBeenCalledWith({
      where: { promotionId: "promo-1" },
    });
    expect(tx.promotion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ active: false, variants: { create: [] } }),
      }),
    );
  });
});
