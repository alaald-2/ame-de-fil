import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
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

const CATEGORY_NOT_FOUND = () =>
  new NotFoundException({ error: "CategoryNotFound", message: "Category not found" });

const ADMIN_TAXONOMY_INCLUDE = {
  translations: true,
  _count: { select: { products: true } },
} as const;

// Mirrors admin-products.service.ts's shape (list/getOne/update, plus create
// and a real delete — categories have no lifecycle status to "retire" a
// product-style way). AdminCollectionsService is a near-exact mirror of this
// file, differing only in which Prisma model it drives; not merged into one
// generic service because this codebase's convention is one service per
// real resource (see admin-products vs admin-orders vs admin-users), and
// genericizing across two models would trade a few dozen duplicated lines
// for indirection that makes both harder to read.
@Injectable()
export class AdminCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    page: number,
    pageSize: number,
  ): Promise<{
    items: AdminTaxonomyListItemResponse[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    const [rows, total] = await Promise.all([
      this.prisma.category.findMany({
        include: ADMIN_TAXONOMY_INCLUDE,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.category.count(),
    ]);

    return {
      items: rows.map((row) => mapAdminTaxonomyListItem(row, DEFAULT_LOCALE)),
      page,
      pageSize,
      total,
    };
  }

  async getOne(id: string): Promise<AdminTaxonomyResponse> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: ADMIN_TAXONOMY_INCLUDE,
    });
    if (!category) throw CATEGORY_NOT_FOUND();
    return mapAdminTaxonomy(category);
  }

  async create(input: CreateTaxonomyInput, actorUserId: string, ipAddress?: string): Promise<{ id: string }> {
    try {
      const category = await this.prisma.$transaction(async (tx) => {
        const created = await tx.category.create({ data: {} });

        await tx.categoryTranslation.createMany({
          data: input.translations.map((t) => ({
            categoryId: created.id,
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
            action: "category.created",
            entityType: "Category",
            entityId: created.id,
            after: {
              translations: input.translations.map((t) => ({ locale: t.locale, name: t.name, slug: t.slug })),
            },
            ipAddress,
          },
          tx,
        );

        return created;
      });

      return { id: category.id };
    } catch (error) {
      if (isUniqueConstraintViolation(error, "CategoryTranslation", "slug")) {
        throw new ConflictException({
          error: "DuplicateSlug",
          message: "A category with this slug already exists in that locale",
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
    const existing = await this.prisma.category.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw CATEGORY_NOT_FOUND();

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
            await tx.categoryTranslation.upsert({
              where: { categoryId_locale: { categoryId: id, locale } },
              create: { categoryId: id, locale, ...content },
              update: content,
            });
          }
        }

        await this.audit.record(
          {
            actorUserId,
            action: "category.updated",
            entityType: "Category",
            entityId: id,
            after: { updatedFields: Object.keys(input) },
            ipAddress,
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error, "CategoryTranslation", "slug")) {
        throw new ConflictException({
          error: "DuplicateSlug",
          message: "A category with this slug already exists in that locale",
        });
      }
      throw error;
    }

    return this.getOne(id);
  }

  async remove(id: string, actorUserId: string, ipAddress?: string): Promise<void> {
    const existing = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!existing) throw CATEGORY_NOT_FOUND();

    if (existing._count.products > 0) {
      throw new ConflictException({
        error: "CategoryInUse",
        message: `Cannot delete a category tagged on ${existing._count.products} product(s)`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.category.delete({ where: { id } });
      await this.audit.record(
        { actorUserId, action: "category.deleted", entityType: "Category", entityId: id, ipAddress },
        tx,
      );
    });
  }
}
