import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Locale as AppLocale } from "@ame-de-fil/validation";
import { PrismaService } from "../database/prisma.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import {
  ADMIN_PROMOTION_INCLUDE,
  mapAdminPromotion,
  mapAdminPromotionListItem,
  type AdminPromotionResponse,
  type AdminPromotionListItemResponse,
} from "./mappers/admin-promotion.mapper.ts";
import type { CreatePromotionInput } from "./dto/create-promotion.dto.ts";
import type { UpdatePromotionInput } from "./dto/update-promotion.dto.ts";
import {
  lockVariantsForPromotionWrite,
  findOverlapConflicts,
  isExclusionConstraintViolation,
  PROMOTION_VARIANT_NO_OVERLAP_CONSTRAINT,
  type OverlapConflict,
} from "./promotion-overlap.ts";

const DEFAULT_LOCALE: AppLocale = "sv-SE";

const PROMOTION_NOT_FOUND = () =>
  new NotFoundException({ error: "PromotionNotFound", message: "Promotion not found" });

function conflictErrorFor(conflicts: OverlapConflict[]): ConflictException {
  const names = [...new Set(conflicts.map((c) => c.conflictingPromotionName))];
  return new ConflictException({
    error: "ConflictingPromotion",
    message: `One or more selected variants already have an overlapping active promotion: ${names.join(", ")}`,
    conflicts,
  });
}

// Only ever reached via the raw-constraint-violation catch blocks below —
// findOverlapConflicts already names the conflicting promotion(s) in the
// expected path, but the database constraint itself doesn't tell the
// application which row it collided with, so this is deliberately generic.
function genericConflictError(): ConflictException {
  return new ConflictException({
    error: "ConflictingPromotion",
    message: "One or more selected variants already have an overlapping active promotion",
  });
}

@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    page: number,
    pageSize: number,
  ): Promise<{
    items: AdminPromotionListItemResponse[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    const now = new Date();
    const [rows, total] = await Promise.all([
      this.prisma.promotion.findMany({
        include: { _count: { select: { variants: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.promotion.count(),
    ]);

    return {
      items: rows.map((row) => mapAdminPromotionListItem(row, now)),
      page,
      pageSize,
      total,
    };
  }

  async getOne(id: string, locale: AppLocale): Promise<AdminPromotionResponse> {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id },
      include: ADMIN_PROMOTION_INCLUDE,
    });
    if (!promotion) throw PROMOTION_NOT_FOUND();
    return mapAdminPromotion(promotion, locale, DEFAULT_LOCALE, new Date());
  }

  private async assertVariantsExist(variantIds: readonly string[]): Promise<void> {
    const uniqueIds = new Set(variantIds);
    const found = await this.prisma.productVariant.findMany({
      where: { id: { in: [...uniqueIds] } },
      select: { id: true },
    });
    if (found.length !== uniqueIds.size) {
      throw new BadRequestException({
        error: "UnknownVariant",
        message: "One or more variantIds do not exist",
      });
    }
  }

  async create(
    input: CreatePromotionInput,
    actorUserId: string,
    ipAddress?: string,
  ): Promise<{ id: string }> {
    await this.assertVariantsExist(input.variantIds);

    const startsAt = input.startsAt ? new Date(input.startsAt) : null;
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;

    const id = await this.prisma.$transaction(async (tx) => {
      // Locked unconditionally (even for an inactive promotion) so a
      // concurrent write to a different promotion touching the same
      // variant(s) can never interleave with this one — see
      // promotion-overlap.ts's own comment on lock ordering/deadlock safety.
      await lockVariantsForPromotionWrite(tx, input.variantIds);

      if (input.active) {
        const conflicts = await findOverlapConflicts(
          tx,
          input.variantIds,
          { startsAt, endsAt },
          undefined,
        );
        if (conflicts.length > 0) throw conflictErrorFor(conflicts);
      }

      try {
        const created = await tx.promotion.create({
          data: {
            name: input.name,
            percentage: input.percentage,
            startsAt,
            endsAt,
            active: input.active,
            variants: {
              create: input.variantIds.map((variantId) => ({
                productVariantId: variantId,
                activeSnapshot: input.active,
                startsAtSnapshot: startsAt,
                endsAtSnapshot: endsAt,
              })),
            },
          },
        });

        await this.audit.record(
          {
            actorUserId,
            action: "promotion.created",
            entityType: "Promotion",
            entityId: created.id,
            after: {
              name: created.name,
              percentage: created.percentage,
              active: created.active,
              startsAt: created.startsAt,
              endsAt: created.endsAt,
              variantIds: input.variantIds,
            },
            ipAddress,
          },
          tx,
        );

        return created.id;
      } catch (error) {
        // Defense-in-depth only — findOverlapConflicts above already
        // rejects the expected case with a clear message; this catches the
        // narrow race the advisory lock is meant to close if it's ever
        // somehow bypassed (e.g. a future direct-DB write), translating the
        // raw EXCLUDE violation into the same clean error shape.
        if (isExclusionConstraintViolation(error, PROMOTION_VARIANT_NO_OVERLAP_CONSTRAINT)) {
          throw genericConflictError();
        }
        throw error;
      }
    });

    return { id };
  }

  async update(
    id: string,
    input: UpdatePromotionInput,
    actorUserId: string,
    ipAddress?: string,
  ): Promise<AdminPromotionResponse> {
    const existing = await this.prisma.promotion.findUnique({
      where: { id },
      include: { variants: { select: { productVariantId: true } } },
    });
    if (!existing) throw PROMOTION_NOT_FOUND();

    const merged = {
      name: input.name ?? existing.name,
      percentage: input.percentage ?? existing.percentage,
      startsAt:
        input.startsAt !== undefined
          ? input.startsAt
            ? new Date(input.startsAt)
            : null
          : existing.startsAt,
      endsAt:
        input.endsAt !== undefined ? (input.endsAt ? new Date(input.endsAt) : null) : existing.endsAt,
      active: input.active ?? existing.active,
    };

    // Only the DTO's own single-request refine runs before this — it can't
    // see `existing`, so a request that only changes one side of the range
    // (e.g. moving endsAt earlier than an unmentioned, already-stored
    // startsAt) is only ever caught here, against the merged result.
    if (merged.startsAt && merged.endsAt && merged.startsAt >= merged.endsAt) {
      throw new BadRequestException({
        error: "InvalidDateRange",
        message: "endsAt must be after startsAt",
      });
    }

    const existingVariantIds = existing.variants.map((v) => v.productVariantId);
    const variantIds = input.variantIds ?? existingVariantIds;
    if (input.variantIds) {
      await this.assertVariantsExist(input.variantIds);
    }

    // Union of old and new: a variant being *removed* still needs to be
    // locked so its just-freed slot can't race against a concurrent create
    // elsewhere touching the same id.
    const lockScope = [...new Set([...existingVariantIds, ...variantIds])];

    await this.prisma.$transaction(async (tx) => {
      if (lockScope.length > 0) {
        await lockVariantsForPromotionWrite(tx, lockScope);
      }

      if (merged.active) {
        const conflicts = await findOverlapConflicts(
          tx,
          variantIds,
          { startsAt: merged.startsAt, endsAt: merged.endsAt },
          id,
        );
        if (conflicts.length > 0) throw conflictErrorFor(conflicts);
      }

      try {
        // Full replace, same "delete then recreate the whole set" pattern
        // as update-product.dto.ts's categoryIds/collectionIds — simpler
        // than diffing, and cheap at the variant counts this feature deals
        // with. The DELETE commits (within this transaction) before the
        // INSERT below runs, so this promotion's *own* previous row is
        // never seen as a conflict against its own new one.
        await tx.promotionVariant.deleteMany({ where: { promotionId: id } });
        await tx.promotion.update({
          where: { id },
          data: {
            name: merged.name,
            percentage: merged.percentage,
            startsAt: merged.startsAt,
            endsAt: merged.endsAt,
            active: merged.active,
            variants: {
              create: variantIds.map((variantId) => ({
                productVariantId: variantId,
                activeSnapshot: merged.active,
                startsAtSnapshot: merged.startsAt,
                endsAtSnapshot: merged.endsAt,
              })),
            },
          },
        });

        await this.audit.record(
          {
            actorUserId,
            action: "promotion.updated",
            entityType: "Promotion",
            entityId: id,
            before: {
              name: existing.name,
              percentage: existing.percentage,
              active: existing.active,
              startsAt: existing.startsAt,
              endsAt: existing.endsAt,
              variantIds: existingVariantIds,
            },
            after: { ...merged, variantIds },
            ipAddress,
          },
          tx,
        );
      } catch (error) {
        if (isExclusionConstraintViolation(error, PROMOTION_VARIANT_NO_OVERLAP_CONSTRAINT)) {
          throw genericConflictError();
        }
        throw error;
      }
    });

    return this.getOne(id, DEFAULT_LOCALE);
  }

  // Lets the Products admin page detach a single variant from whichever
  // promotion is currently discounting it, without needing to open the
  // Promotions area at all — delegates entirely to update()'s own
  // validated, locked, audited write path rather than duplicating it.
  // Deactivates the promotion instead of leaving a variant-less active row
  // when this was its last variant (an active Promotion with nothing to
  // apply to is meaningless, and there is deliberately no delete path for
  // Promotion at all — see schema.prisma's own comment on OrderItem.promotionId).
  async removeVariant(
    id: string,
    variantId: string,
    actorUserId: string,
    ipAddress?: string,
  ): Promise<AdminPromotionResponse> {
    const existing = await this.prisma.promotion.findUnique({
      where: { id },
      include: { variants: { select: { productVariantId: true } } },
    });
    if (!existing) throw PROMOTION_NOT_FOUND();

    const remaining = existing.variants
      .map((v) => v.productVariantId)
      .filter((v) => v !== variantId);
    if (remaining.length === existing.variants.length) {
      throw new NotFoundException({
        error: "PromotionVariantNotFound",
        message: "This promotion does not apply to that variant",
      });
    }

    const input: UpdatePromotionInput =
      remaining.length > 0 ? { variantIds: remaining } : { variantIds: [], active: false };
    return this.update(id, input, actorUserId, ipAddress);
  }
}
