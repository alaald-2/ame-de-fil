import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { HomepageSectionKey } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import { IMAGE_STORAGE_PROVIDER, type ImageStorageProvider } from "../images/image-storage.provider.ts";
import { mapAdminHomepageSection } from "./mappers/homepage-section.mapper.ts";
import type { AdminHomepageSectionResponse } from "./dto/responses.ts";
import { toPrismaHomepageSectionKey, type HomepageSectionSlug } from "./dto/homepage-section-key.param.ts";
import type { HomepageSectionContentInput } from "./dto/homepage-section-content.dto.ts";

const ALL_KEYS = [
  HomepageSectionKey.HERO,
  HomepageSectionKey.STORY,
  HomepageSectionKey.MADE_TO_ORDER,
  HomepageSectionKey.ANNOUNCEMENT,
] as const;

// `undefined` (key omitted from the request body) means "leave unchanged";
// an explicit empty string means "clear back to the built-in default copy"
// (stored as `null`, same as a field that was never set) — see
// homepage-section-content.dto.ts's own comment on this distinction.
function toNullableUpdate(value: string | undefined): string | null | undefined {
  return value === undefined ? undefined : value === "" ? null : value;
}

// Mirrors admin-hero-slides.service.ts's own upload validation exactly
// (same provider, same limits — just a different Cloudinary folder).
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class AdminHomepageSectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(IMAGE_STORAGE_PROVIDER) private readonly imageStorage: ImageStorageProvider,
  ) {}

  async list(): Promise<AdminHomepageSectionResponse[]> {
    const rows = await this.prisma.homepageSection.findMany();
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return ALL_KEYS.map((key) => mapAdminHomepageSection(byKey.get(key) ?? { key, imageUrl: null }));
  }

  async uploadImage(
    slug: HomepageSectionSlug,
    file: { buffer: Buffer; mimetype: string },
    actorUserId: string,
    ipAddress?: string,
  ): Promise<AdminHomepageSectionResponse> {
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

    const key = toPrismaHomepageSectionKey(slug);
    const existing = await this.prisma.homepageSection.findUnique({ where: { key } });

    const uploaded = await this.imageStorage.upload(file.buffer, { folder: "homepage-sections" });

    // Delete the old Cloudinary asset only *after* the new one is safely
    // uploaded — the opposite order from hero-slides delete, since this is
    // a replace, not a removal: a failed upload must never leave the slot
    // pointing at nothing when it previously had a real image.
    const section = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.homepageSection.upsert({
        where: { key },
        update: { imageUrl: uploaded.url, cloudinaryPublicId: uploaded.publicId },
        create: { key, imageUrl: uploaded.url, cloudinaryPublicId: uploaded.publicId },
      });

      await this.audit.record(
        {
          actorUserId,
          action: "homepage_section.image_uploaded",
          entityType: "HomepageSection",
          entityId: key,
          before: { imageUrl: existing?.imageUrl ?? null },
          after: { imageUrl: updated.imageUrl },
          ipAddress,
        },
        tx,
      );

      return updated;
    });

    if (existing?.cloudinaryPublicId) {
      await this.imageStorage.delete(existing.cloudinaryPublicId);
    }

    return mapAdminHomepageSection(section);
  }

  async deleteImage(slug: HomepageSectionSlug, actorUserId: string, ipAddress?: string): Promise<AdminHomepageSectionResponse> {
    const key = toPrismaHomepageSectionKey(slug);
    const existing = await this.prisma.homepageSection.findUnique({ where: { key } });

    if (existing?.cloudinaryPublicId) {
      await this.imageStorage.delete(existing.cloudinaryPublicId);
    }

    const section = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.homepageSection.upsert({
        where: { key },
        update: { imageUrl: null, cloudinaryPublicId: null },
        create: { key, imageUrl: null, cloudinaryPublicId: null },
      });

      await this.audit.record(
        {
          actorUserId,
          action: "homepage_section.image_removed",
          entityType: "HomepageSection",
          entityId: key,
          before: { imageUrl: existing?.imageUrl ?? null },
          after: { imageUrl: null },
          ipAddress,
        },
        tx,
      );

      return updated;
    });

    return mapAdminHomepageSection(section);
  }

  async updateContent(
    slug: HomepageSectionSlug,
    input: HomepageSectionContentInput,
    actorUserId: string,
    ipAddress?: string,
  ): Promise<AdminHomepageSectionResponse> {
    const key = toPrismaHomepageSectionKey(slug);
    const existing = await this.prisma.homepageSection.findUnique({ where: { key } });

    const data = {
      eyebrowSv: toNullableUpdate(input.eyebrowSv),
      eyebrowEn: toNullableUpdate(input.eyebrowEn),
      titleSv: toNullableUpdate(input.titleSv),
      titleEn: toNullableUpdate(input.titleEn),
      descriptionSv: toNullableUpdate(input.descriptionSv),
      descriptionEn: toNullableUpdate(input.descriptionEn),
      ctaLabelSv: toNullableUpdate(input.ctaLabelSv),
      ctaLabelEn: toNullableUpdate(input.ctaLabelEn),
      ctaHref: toNullableUpdate(input.ctaHref),
    };

    const section = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.homepageSection.upsert({
        where: { key },
        update: data,
        create: { key, ...data },
      });

      await this.audit.record(
        {
          actorUserId,
          action: "homepage_section.content_updated",
          entityType: "HomepageSection",
          entityId: key,
          before: existing ? mapAdminHomepageSection(existing) : undefined,
          after: mapAdminHomepageSection(updated),
          ipAddress,
        },
        tx,
      );

      return updated;
    });

    return mapAdminHomepageSection(section);
  }
}
