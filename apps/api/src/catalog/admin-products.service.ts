import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Currency, Prisma } from "@ame-de-fil/database";
import type { Locale as AppLocale } from "@ame-de-fil/validation";
import { PrismaService } from "../database/prisma.service.ts";
import { toPrismaLocale } from "../common/locale.ts";
import { AuditService } from "../audit/audit.service.ts";
import { isUniqueConstraintViolation } from "../checkout/prisma-errors.ts";
import {
  ADMIN_PRODUCT_INCLUDE,
  mapAdminProduct,
  mapAdminProductListItem,
  type AdminProductResponse,
  type AdminProductListItemResponse,
} from "./mappers/admin-product.mapper.ts";
import type { CreateProductInput } from "./dto/create-product.dto.ts";
import type { UpdateProductInput } from "./dto/update-product.dto.ts";

const DEFAULT_LOCALE: AppLocale = "sv-SE";

const PRODUCT_NOT_FOUND = () =>
  new NotFoundException({ error: "ProductNotFound", message: "Product not found" });

// DRAFT -> PUBLISHED -> ARCHIVED only, no going backward — a Zod enum can't
// express this (it's a state-machine rule, not a shape rule), so it's
// enforced here the same way admin-orders.service.ts's fulfillment
// transitions are.
const LEGAL_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PUBLISHED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};

@Injectable()
export class AdminProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    page: number,
    pageSize: number,
  ): Promise<{
    items: AdminProductListItemResponse[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        include: ADMIN_PRODUCT_INCLUDE,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.product.count(),
    ]);

    return {
      items: rows.map((row) => mapAdminProductListItem(row, DEFAULT_LOCALE)),
      page,
      pageSize,
      total,
    };
  }

  async getOne(id: string): Promise<AdminProductResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: ADMIN_PRODUCT_INCLUDE,
    });
    if (!product) throw PRODUCT_NOT_FOUND();
    return mapAdminProduct(product);
  }

  async update(
    id: string,
    input: UpdateProductInput,
    actorUserId: string,
    ipAddress?: string,
  ): Promise<AdminProductResponse> {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, status: true, variants: { select: { id: true } } },
    });
    if (!existing) throw PRODUCT_NOT_FOUND();

    if (input.status && input.status !== existing.status) {
      const legalNextStates = LEGAL_STATUS_TRANSITIONS[existing.status] ?? [];
      if (!legalNextStates.includes(input.status)) {
        throw new ConflictException({
          error: "IllegalStatusTransition",
          message: `Cannot transition from "${existing.status}" to "${input.status}"`,
        });
      }
    }

    if (input.categoryIds) await this.assertCategoriesExist(input.categoryIds);
    if (input.collectionIds) await this.assertCollectionsExist(input.collectionIds);

    let taxClassByCode: Map<string, { id: string; code: string }> | undefined;
    if (input.variants) {
      const existingVariantIds = new Set(existing.variants.map((v) => v.id));
      for (const variant of input.variants) {
        if (!existingVariantIds.has(variant.id)) {
          throw new BadRequestException({
            error: "UnknownVariant",
            message: `Variant "${variant.id}" does not belong to this product`,
          });
        }
      }

      const codes = [
        ...new Set(
          input.variants.map((v) => v.taxClassCode).filter((c): c is string => c !== undefined),
        ),
      ];
      if (codes.length > 0) {
        const taxClasses = await this.prisma.taxClass.findMany({ where: { code: { in: codes } } });
        taxClassByCode = new Map(taxClasses.map((t) => [t.code, t]));
        for (const code of codes) {
          if (!taxClassByCode.has(code)) {
            throw new BadRequestException({
              error: "UnknownTaxClass",
              message: `No tax class with code "${code}"`,
            });
          }
        }
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        if (input.translations) {
          for (const t of input.translations) {
            const locale = toPrismaLocale(t.locale);
            const content = {
              name: t.name,
              slug: t.slug,
              description: t.description,
              story: t.story,
              careInstructions: t.careInstructions,
              materials: t.materials,
              metaTitle: t.metaTitle,
              metaDescription: t.metaDescription,
            };
            await tx.productTranslation.upsert({
              where: { productId_locale: { productId: id, locale } },
              create: { productId: id, locale, ...content },
              update: content,
            });
          }
        }

        if (input.categoryIds) {
          await tx.productCategory.deleteMany({ where: { productId: id } });
          if (input.categoryIds.length > 0) {
            await tx.productCategory.createMany({
              data: input.categoryIds.map((categoryId) => ({ productId: id, categoryId })),
            });
          }
        }

        if (input.collectionIds) {
          await tx.productCollection.deleteMany({ where: { productId: id } });
          if (input.collectionIds.length > 0) {
            await tx.productCollection.createMany({
              data: input.collectionIds.map((collectionId) => ({ productId: id, collectionId })),
            });
          }
        }

        if (input.variants) {
          for (const variant of input.variants) {
            const variantData: Prisma.ProductVariantUpdateInput = {};
            if (variant.priceMinor !== undefined) variantData.priceMinor = variant.priceMinor;
            if (variant.weightGrams !== undefined) variantData.weightGrams = variant.weightGrams;
            if (variant.isActive !== undefined) variantData.isActive = variant.isActive;
            if (variant.taxClassCode !== undefined) {
              const taxClass = taxClassByCode?.get(variant.taxClassCode);
              if (taxClass) variantData.taxClass = { connect: { id: taxClass.id } };
            }
            if (Object.keys(variantData).length > 0) {
              await tx.productVariant.update({ where: { id: variant.id }, data: variantData });
            }

            if (variant.isLimitedEdition !== undefined || variant.productionTimeDays !== undefined) {
              const inventoryData: Prisma.InventoryItemUpdateInput = {};
              if (variant.isLimitedEdition !== undefined) {
                inventoryData.isLimitedEdition = variant.isLimitedEdition;
              }
              if (variant.productionTimeDays !== undefined) {
                inventoryData.productionTimeDays = variant.productionTimeDays;
              }
              await tx.inventoryItem.update({
                where: { productVariantId: variant.id },
                data: inventoryData,
              });
            }
          }
        }

        if (input.status && input.status !== existing.status) {
          await tx.product.update({
            where: { id },
            data: {
              status: input.status,
              ...(input.status === "PUBLISHED" && existing.status === "DRAFT"
                ? { publishedAt: new Date() }
                : {}),
            },
          });
        }

        await this.audit.record(
          {
            actorUserId,
            action: "product.updated",
            entityType: "Product",
            entityId: id,
            before: { status: existing.status },
            after: { status: input.status ?? existing.status, updatedFields: Object.keys(input) },
            ipAddress,
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error, "ProductTranslation", "slug")) {
        throw new ConflictException({
          error: "DuplicateSlug",
          message: "A product with this slug already exists in that locale",
        });
      }
      throw error;
    }

    return this.getOne(id);
  }

  async createProduct(
    input: CreateProductInput,
    actorUserId: string,
    ipAddress?: string,
  ): Promise<{ id: string }> {
    this.validateOptionSelections(input);
    this.validateUniqueSkus(input);

    const taxClassByCode = await this.resolveTaxClasses(input);
    await this.assertCategoriesExist(input.categoryIds);
    await this.assertCollectionsExist(input.collectionIds);

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({ data: {} });

      await tx.productTranslation.createMany({
        data: input.translations.map((t) => ({
          productId: created.id,
          locale: toPrismaLocale(t.locale),
          name: t.name,
          slug: t.slug,
          description: t.description,
          story: t.story,
          careInstructions: t.careInstructions,
          materials: t.materials,
          metaTitle: t.metaTitle,
          metaDescription: t.metaDescription,
        })),
      });

      const optionIndex = await this.createOptions(tx, created.id, input.options);

      for (const variantInput of input.variants) {
        const taxClass = taxClassByCode.get(variantInput.taxClassCode);
        if (!taxClass) {
          // Already validated above — this only guards against a
          // theoretical race (tax class deleted mid-request).
          throw new BadRequestException({
            error: "UnknownTaxClass",
            message: `No tax class with code "${variantInput.taxClassCode}"`,
          });
        }

        const variant = await tx.productVariant.create({
          data: {
            productId: created.id,
            sku: variantInput.sku,
            priceMinor: variantInput.priceMinor,
            currency: Currency.SEK,
            taxClassId: taxClass.id,
            weightGrams: variantInput.weightGrams,
          },
        });

        await tx.inventoryItem.create({
          data: {
            productVariantId: variant.id,
            onHand: variantInput.initialStock,
            tracksStock: variantInput.tracksStock,
            isLimitedEdition: variantInput.isLimitedEdition,
            productionTimeDays: variantInput.productionTimeDays,
          },
        });

        for (const [key, valueSlug] of Object.entries(variantInput.selectedOptionValues)) {
          const optionEntry = optionIndex.get(key);
          const optionValueId = optionEntry?.values.get(valueSlug);
          if (!optionEntry || !optionValueId) continue; // validated above; defensive only
          await tx.productVariantOptionValue.create({
            data: {
              productVariantId: variant.id,
              productOptionId: optionEntry.optionId,
              productOptionValueId: optionValueId,
            },
          });
        }
      }

      if (input.categoryIds.length > 0) {
        await tx.productCategory.createMany({
          data: input.categoryIds.map((categoryId) => ({ productId: created.id, categoryId })),
        });
      }
      if (input.collectionIds.length > 0) {
        await tx.productCollection.createMany({
          data: input.collectionIds.map((collectionId) => ({
            productId: created.id,
            collectionId,
          })),
        });
      }

      await this.audit.record(
        {
          actorUserId,
          action: "product.created",
          entityType: "Product",
          entityId: created.id,
          after: {
            translations: input.translations.map((t) => ({
              locale: t.locale,
              name: t.name,
              slug: t.slug,
            })),
            skus: input.variants.map((v) => v.sku),
          },
          ipAddress,
        },
        tx,
      );

      return created;
    });

    return { id: product.id };
  }

  // Cross-field constraint Zod's static schema can't express (DTO comment) —
  // every variant's selected value must reference a value declared in options[].
  private validateOptionSelections(input: CreateProductInput): void {
    const declared = new Map(
      input.options.map((o) => [o.key, new Set(o.values.map((v) => v.value))]),
    );
    for (const variant of input.variants) {
      for (const [key, value] of Object.entries(variant.selectedOptionValues)) {
        const values = declared.get(key);
        if (!values || !values.has(value)) {
          throw new BadRequestException({
            error: "InvalidOptionSelection",
            message: `Variant "${variant.sku}" selects "${key}=${value}", which was not declared in options[]`,
          });
        }
      }
    }
  }

  private validateUniqueSkus(input: CreateProductInput): void {
    const skus = input.variants.map((v) => v.sku);
    if (new Set(skus).size !== skus.length) {
      throw new BadRequestException({
        error: "DuplicateSku",
        message: "Variant SKUs must be unique within a product",
      });
    }
  }

  private async resolveTaxClasses(input: CreateProductInput) {
    const codes = [...new Set(input.variants.map((v) => v.taxClassCode))];
    const taxClasses = await this.prisma.taxClass.findMany({ where: { code: { in: codes } } });
    const byCode = new Map(taxClasses.map((t) => [t.code, t]));
    for (const code of codes) {
      if (!byCode.has(code)) {
        throw new BadRequestException({
          error: "UnknownTaxClass",
          message: `No tax class with code "${code}"`,
        });
      }
    }
    return byCode;
  }

  private async assertCategoriesExist(categoryIds: string[]): Promise<void> {
    if (categoryIds.length === 0) return;
    const found = await this.prisma.category.findMany({ where: { id: { in: categoryIds } } });
    if (found.length !== new Set(categoryIds).size) {
      throw new BadRequestException({
        error: "UnknownCategory",
        message: "One or more categoryIds do not exist",
      });
    }
  }

  private async assertCollectionsExist(collectionIds: string[]): Promise<void> {
    if (collectionIds.length === 0) return;
    const found = await this.prisma.collection.findMany({ where: { id: { in: collectionIds } } });
    if (found.length !== new Set(collectionIds).size) {
      throw new BadRequestException({
        error: "UnknownCollection",
        message: "One or more collectionIds do not exist",
      });
    }
  }

  private async createOptions(
    tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    productId: string,
    options: CreateProductInput["options"],
  ): Promise<Map<string, { optionId: string; values: Map<string, string> }>> {
    const index = new Map<string, { optionId: string; values: Map<string, string> }>();

    for (const [position, option] of options.entries()) {
      const createdOption = await tx.productOption.create({
        data: { productId, key: option.key, position },
      });
      const values = new Map<string, string>();
      for (const [valuePosition, value] of option.values.entries()) {
        const createdValue = await tx.productOptionValue.create({
          data: {
            productOptionId: createdOption.id,
            value: value.value,
            labelSv: value.labelSv,
            labelEn: value.labelEn,
            position: valuePosition,
          },
        });
        values.set(value.value, createdValue.id);
      }
      index.set(option.key, { optionId: createdOption.id, values });
    }

    return index;
  }
}
