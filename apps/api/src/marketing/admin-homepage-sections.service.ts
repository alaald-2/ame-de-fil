import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { HomepageSectionKey } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import { IMAGE_STORAGE_PROVIDER, type ImageStorageProvider } from "../images/image-storage.provider.ts";
import { mapHomepageSection } from "./mappers/homepage-section.mapper.ts";
import type { HomepageSectionResponse } from "./dto/responses.ts";
import { toPrismaHomepageSectionKey, type HomepageSectionSlug } from "./dto/homepage-section-key.param.ts";

const ALL_KEYS = [HomepageSectionKey.STORY, HomepageSectionKey.MADE_TO_ORDER] as const;

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

  async list(): Promise<HomepageSectionResponse[]> {
    const rows = await this.prisma.homepageSection.findMany();
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return ALL_KEYS.map((key) => mapHomepageSection(byKey.get(key) ?? { key, imageUrl: null }));
  }

  async uploadImage(
    slug: HomepageSectionSlug,
    file: { buffer: Buffer; mimetype: string },
    actorUserId: string,
    ipAddress?: string,
  ): Promise<HomepageSectionResponse> {
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

    return mapHomepageSection(section);
  }

  async deleteImage(slug: HomepageSectionSlug, actorUserId: string, ipAddress?: string): Promise<HomepageSectionResponse> {
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

    return mapHomepageSection(section);
  }
}
