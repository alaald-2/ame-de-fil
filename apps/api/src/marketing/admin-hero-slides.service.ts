import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import {
  IMAGE_STORAGE_PROVIDER,
  type ImageStorageProvider,
} from "../images/image-storage.provider.ts";
import { mapAdminHeroSlide } from "./mappers/hero-slide.mapper.ts";
import type { AdminHeroSlideResponse } from "./dto/responses.ts";
import type { HeroSlideCtaInput, UpdateHeroSlideInput } from "./dto/hero-slide-cta.dto.ts";

const HERO_SLIDE_NOT_FOUND = () =>
  new NotFoundException({ error: "HeroSlideNotFound", message: "Hero slide not found" });

// Mirrors admin-products.service.ts's own image upload validation exactly
// (product images and hero slides go through the same Cloudinary-backed
// provider, just a different folder — see images.module.ts's own comment).
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class AdminHeroSlidesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(IMAGE_STORAGE_PROVIDER) private readonly imageStorage: ImageStorageProvider,
  ) {}

  // Every slide, active or not — this is the admin's own management list,
  // unlike HeroSlidesService.listActive's public-only view.
  async list(): Promise<AdminHeroSlideResponse[]> {
    const slides = await this.prisma.heroSlide.findMany({ orderBy: { position: "asc" } });
    return slides.map(mapAdminHeroSlide);
  }

  async upload(
    file: { buffer: Buffer; mimetype: string },
    cta: HeroSlideCtaInput,
    actorUserId: string,
    ipAddress?: string,
  ): Promise<AdminHeroSlideResponse> {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException({
        error: "UnsupportedImageType",
        message: "Only JPEG, PNG, and WebP images are supported",
      });
    }
    if (file.buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new BadRequestException({
        error: "ImageTooLarge",
        message: "Images must be 5MB or smaller",
      });
    }

    const uploaded = await this.imageStorage.upload(file.buffer, { folder: "hero-slides" });

    const { _max } = await this.prisma.heroSlide.aggregate({ _max: { position: true } });
    const position = (_max.position ?? -1) + 1;

    const slide = await this.prisma.$transaction(async (tx) => {
      const created = await tx.heroSlide.create({
        data: {
          imageUrl: uploaded.url,
          cloudinaryPublicId: uploaded.publicId,
          position,
          ctaLabelSv: cta.ctaLabelSv ?? null,
          ctaLabelEn: cta.ctaLabelEn ?? null,
          ctaHref: cta.ctaHref ?? null,
        },
      });

      await this.audit.record(
        {
          actorUserId,
          action: "hero_slide.uploaded",
          entityType: "HeroSlide",
          entityId: created.id,
          after: { imageUrl: created.imageUrl },
          ipAddress,
        },
        tx,
      );

      return created;
    });

    return mapAdminHeroSlide(slide);
  }

  // Rejects anything that isn't exactly the current set of slide ids, each
  // listed once — same reasoning as admin-products.service.ts's own
  // reorderImages (a partial/unknown list would leave positions the client
  // and server disagree about).
  async reorder(
    slideIds: string[],
    actorUserId: string,
    ipAddress?: string,
  ): Promise<AdminHeroSlideResponse[]> {
    const existing = await this.prisma.heroSlide.findMany({ select: { id: true } });
    const existingIds = existing.map((slide) => slide.id);
    const isExactlyTheCurrentSet =
      slideIds.length === existingIds.length &&
      new Set(slideIds).size === existingIds.length &&
      existingIds.every((id) => slideIds.includes(id));
    if (!isExactlyTheCurrentSet) {
      throw new BadRequestException({
        error: "InvalidSlideOrder",
        message: "slideIds must list every current hero slide's id, each exactly once",
      });
    }

    const reordered = await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        slideIds.map((id, position) => tx.heroSlide.update({ where: { id }, data: { position } })),
      );

      await this.audit.record(
        {
          actorUserId,
          action: "hero_slide.reordered",
          entityType: "HeroSlide",
          entityId: "all",
          after: { slideIds },
          ipAddress,
        },
        tx,
      );

      return tx.heroSlide.findMany({ orderBy: { position: "asc" } });
    });

    return reordered.map(mapAdminHeroSlide);
  }

  async update(
    id: string,
    input: UpdateHeroSlideInput,
    actorUserId: string,
    ipAddress?: string,
  ): Promise<AdminHeroSlideResponse> {
    const existing = await this.prisma.heroSlide.findUnique({ where: { id } });
    if (!existing) throw HERO_SLIDE_NOT_FOUND();

    const slide = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.heroSlide.update({
        where: { id },
        data: {
          ...(input.ctaLabelSv !== undefined ? { ctaLabelSv: input.ctaLabelSv } : {}),
          ...(input.ctaLabelEn !== undefined ? { ctaLabelEn: input.ctaLabelEn } : {}),
          ...(input.ctaHref !== undefined ? { ctaHref: input.ctaHref } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });

      await this.audit.record(
        {
          actorUserId,
          action: "hero_slide.updated",
          entityType: "HeroSlide",
          entityId: id,
          before: {
            ctaLabelSv: existing.ctaLabelSv,
            ctaLabelEn: existing.ctaLabelEn,
            ctaHref: existing.ctaHref,
            isActive: existing.isActive,
          },
          after: {
            ctaLabelSv: updated.ctaLabelSv,
            ctaLabelEn: updated.ctaLabelEn,
            ctaHref: updated.ctaHref,
            isActive: updated.isActive,
          },
          ipAddress,
        },
        tx,
      );

      return updated;
    });

    return mapAdminHeroSlide(slide);
  }

  async delete(id: string, actorUserId: string, ipAddress?: string): Promise<void> {
    const existing = await this.prisma.heroSlide.findUnique({ where: { id } });
    if (!existing) throw HERO_SLIDE_NOT_FOUND();

    // Delete the Cloudinary asset before the DB row — same "disclosed
    // rather than faked" posture as admin-products.service.ts's own
    // deleteImage: if the external delete fails, keep the row rather than
    // orphan the asset in storage with nothing left pointing at it.
    if (existing.cloudinaryPublicId) {
      await this.imageStorage.delete(existing.cloudinaryPublicId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.heroSlide.delete({ where: { id } });

      await this.audit.record(
        {
          actorUserId,
          action: "hero_slide.deleted",
          entityType: "HeroSlide",
          entityId: id,
          before: { imageUrl: existing.imageUrl },
          ipAddress,
        },
        tx,
      );
    });
  }
}
