import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@ame-de-fil/database";
import type { Locale as AppLocale } from "@ame-de-fil/validation";
import { PrismaService } from "../database/prisma.service.ts";
import { toPrismaLocale } from "../common/locale.ts";
import { AuditService } from "../audit/audit.service.ts";
import { isUniqueConstraintViolation } from "../checkout/prisma-errors.ts";
import {
  mapAdminTaxonomy,
  mapAdminTaxonomyListItem,
  type AdminTaxonomyResponse,
  type AdminTaxonomyListItemResponse,
} from "./mappers/admin-taxonomy.mapper.ts";
import type { CreateTaxonomyInput, UpdateTaxonomyInput } from "./dto/taxonomy.dto.ts";

const DEFAULT_LOCALE: AppLocale = "sv-SE";

const COLLECTION_NOT_FOUND = () =>
  new NotFoundException({ error: "CollectionNotFound", message: "Collection not found" });

const ADMIN_TAXONOMY_INCLUDE = {
  translations: true,
  _count: { select: { products: true } },
} as const;

// Mirror of admin-categories.service.ts, driving Collection/CollectionTranslation
// instead of Category/CategoryTranslation — see that file's top comment for
// why this isn't genericized into one shared service.
@Injectable()
export class AdminCollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    page: number,
    pageSize: number,
    q?: string,
  ): Promise<{
    items: AdminTaxonomyListItemResponse[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    const where: Prisma.CollectionWhereInput = q
      ? { translations: { some: { name: { contains: q, mode: "insensitive" } } } }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.collection.findMany({
        where,
        include: ADMIN_TAXONOMY_INCLUDE,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.collection.count({ where }),
    ]);

    return {
      items: rows.map((row) => mapAdminTaxonomyListItem(row, DEFAULT_LOCALE)),
      page,
      pageSize,
      total,
    };
  }

  async getOne(id: string): Promise<AdminTaxonomyResponse> {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
      include: ADMIN_TAXONOMY_INCLUDE,
    });
    if (!collection) throw COLLECTION_NOT_FOUND();
    return mapAdminTaxonomy(collection);
  }

  async create(
    input: CreateTaxonomyInput,
    actorUserId: string,
    ipAddress?: string,
  ): Promise<{ id: string }> {
    try {
      const collection = await this.prisma.$transaction(async (tx) => {
        const created = await tx.collection.create({ data: {} });

        await tx.collectionTranslation.createMany({
          data: input.translations.map((t) => ({
            collectionId: created.id,
            locale: toPrismaLocale(t.locale),
            name: t.name,
            slug: t.slug,
            description: t.description,
            metaTitle: t.metaTitle,
            metaDescription: t.metaDescription,
          })),
        });

        await this.audit.record(
          {
            actorUserId,
            action: "collection.created",
            entityType: "Collection",
            entityId: created.id,
            after: {
              translations: input.translations.map((t) => ({
                locale: t.locale,
                name: t.name,
                slug: t.slug,
              })),
            },
            ipAddress,
          },
          tx,
        );

        return created;
      });

      return { id: collection.id };
    } catch (error) {
      if (isUniqueConstraintViolation(error, "CollectionTranslation", "slug")) {
        throw new ConflictException({
          error: "DuplicateSlug",
          message: "A collection with this slug already exists in that locale",
        });
      }
      throw error;
    }
  }

  async update(
    id: string,
    input: UpdateTaxonomyInput,
    actorUserId: string,
    ipAddress?: string,
  ): Promise<AdminTaxonomyResponse> {
    const existing = await this.prisma.collection.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw COLLECTION_NOT_FOUND();

    try {
      await this.prisma.$transaction(async (tx) => {
        if (input.translations) {
          for (const t of input.translations) {
            const locale = toPrismaLocale(t.locale);
            const content = {
              name: t.name,
              slug: t.slug,
              description: t.description,
              metaTitle: t.metaTitle,
              metaDescription: t.metaDescription,
            };
            await tx.collectionTranslation.upsert({
              where: { collectionId_locale: { collectionId: id, locale } },
              create: { collectionId: id, locale, ...content },
              update: content,
            });
          }
        }

        await this.audit.record(
          {
            actorUserId,
            action: "collection.updated",
            entityType: "Collection",
            entityId: id,
            after: { updatedFields: Object.keys(input) },
            ipAddress,
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error, "CollectionTranslation", "slug")) {
        throw new ConflictException({
          error: "DuplicateSlug",
          message: "A collection with this slug already exists in that locale",
        });
      }
      throw error;
    }

    return this.getOne(id);
  }

  async remove(id: string, actorUserId: string, ipAddress?: string): Promise<void> {
    const existing = await this.prisma.collection.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!existing) throw COLLECTION_NOT_FOUND();

    if (existing._count.products > 0) {
      throw new ConflictException({
        error: "CollectionInUse",
        message: `Cannot delete a collection tagged on ${existing._count.products} product(s)`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.collection.delete({ where: { id } });
      await this.audit.record(
        {
          actorUserId,
          action: "collection.deleted",
          entityType: "Collection",
          entityId: id,
          ipAddress,
        },
        tx,
      );
    });
  }
}
