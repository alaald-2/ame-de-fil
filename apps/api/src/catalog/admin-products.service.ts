import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Currency, Prisma, type ProductStatus } from "@ame-de-fil/database";
import type { Locale as AppLocale } from "@ame-de-fil/validation";
import { PrismaService } from "../database/prisma.service.ts";
import { toPrismaLocale } from "../common/locale.ts";
import { AuditService } from "../audit/audit.service.ts";
import { isUniqueConstraintViolation } from "../checkout/prisma-errors.ts";
import { IMAGE_STORAGE_PROVIDER, type ImageStorageProvider } from "./images/image-storage.provider.ts";
import { resolveTranslation } from "./mappers/translation.mapper.ts";
import { collectVariantIds } from "./mappers/product.mapper.ts";
import { resolveActivePromotionsForVariants } from "../promotions/effective-price.ts";
import {
  ADMIN_PRODUCT_INCLUDE,
  mapAdminProduct,
  mapAdminProductListItem,
  mapAdminProductImage,
  type AdminProductResponse,
  type AdminProductListItemResponse,
  type AdminProductImageResponse,
} from "./mappers/admin-product.mapper.ts";
import type { CreateProductInput } from "./dto/create-product.dto.ts";
import type { UpdateProductInput } from "./dto/update-product.dto.ts";
import type { ProductImageAltTextInput } from "./dto/product-image.dto.ts";

const DEFAULT_LOCALE: AppLocale = "sv-SE";

const PRODUCT_NOT_FOUND = () =>
  new NotFoundException({ error: "ProductNotFound", message: "Product not found" });

const PRODUCT_IMAGE_NOT_FOUND = () =>
  new NotFoundException({ error: "ProductImageNotFound", message: "Product image not found" });

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// DRAFT -> PUBLISHED -> ARCHIVED, with ARCHIVED -> PUBLISHED as the one way
// back (an admin needs to be able to undo an accidental archive, or bring a
// discontinued product back) — a Zod enum can't express this (it's a
// state-machine rule, not a shape rule), so it's enforced here the same way
// admin-orders.service.ts's fulfillment transitions are.
const LEGAL_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PUBLISHED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: ["PUBLISHED"],
};

@Injectable()
export class AdminProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(IMAGE_STORAGE_PROVIDER) private readonly imageStorage: ImageStorageProvider,
  ) {}

  async list(
    page: number,
    pageSize: number,
    status?: ProductStatus,
  ): Promise<{
    items: AdminProductListItemResponse[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    const where: Prisma.ProductWhereInput = { ...(status ? { status } : {}) };

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: ADMIN_PRODUCT_INCLUDE,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.product.count({ where }),
    ]);

    // Batched exactly like the public catalog list (products.service.ts) —
    // one resolveActivePromotionsForVariants call across every variant on
    // this page of products, never N+1 — so the list can show "was X, now
    // Y" using effective-price.ts as the single source of truth, the same
    // as everywhere else that number is computed.
    const promotions = await resolveActivePromotionsForVariants(
      this.prisma,
      collectVariantIds(rows),
      new Date(),
    );

    return {
      items: rows.map((row) => mapAdminProductListItem(row, DEFAULT_LOCALE, promotions)),
      page,
      pageSize,
      total,
    };
  }

  // Exists only so a caller creating/editing a product variant knows what's
  // a valid taxClassCode (AdminTaxClassesController's own reasoning) — not
  // a Products concern per se, but this is the service every consumer of
  // that data already depends on.
  async listTaxClasses(): Promise<{ id: string; code: string; name: string }[]> {
    const taxClasses = await this.prisma.taxClass.findMany({ orderBy: { code: "asc" } });
    return taxClasses.map((t) => ({ id: t.id, code: t.code, name: t.name }));
  }

  // Exists only to feed the Promotions admin UI's variant picker (a
  // promotion applies to specific variants, chosen from across every
  // product) — a flat, lightweight list, not the full ADMIN_PRODUCT_INCLUDE
  // shape GET /admin/products/:id returns, since the picker only ever needs
  // enough to label a checkbox. ARCHIVED excluded: promoting a discontinued
  // product's variant would be confusing and is never a real use case,
  // unlike DRAFT (an admin may want to schedule a sale ahead of a launch).
  async listVariantOptions(locale: AppLocale): Promise<
    {
      variantId: string;
      articleNumber: number;
      sku: string | null;
      priceMinor: number;
      productId: string;
      productName: string;
    }[]
  > {
    const variants = await this.prisma.productVariant.findMany({
      where: { product: { status: { not: "ARCHIVED" } } },
      include: { product: { include: { translations: true } } },
      orderBy: { articleNumber: "asc" },
    });

    return variants.map((variant) => {
      const translation = resolveTranslation(variant.product.translations, locale, DEFAULT_LOCALE);
      return {
        variantId: variant.id,
        articleNumber: variant.articleNumber,
        sku: variant.sku,
        priceMinor: variant.priceMinor,
        productId: variant.product.id,
        productName: translation?.name ?? variant.sku ?? String(variant.articleNumber),
      };
    });
  }

  async getOne(id: string): Promise<AdminProductResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: ADMIN_PRODUCT_INCLUDE,
    });
    if (!product) throw PRODUCT_NOT_FOUND();

    const promotions = await resolveActivePromotionsForVariants(
      this.prisma,
      product.variants.map((v) => v.id),
      new Date(),
    );
    return mapAdminProduct(product, promotions);
  }

  async uploadImage(
    productId: string,
    file: { buffer: Buffer; mimetype: string },
    altText: ProductImageAltTextInput,
    actorUserId: string,
    ipAddress?: string,
  ): Promise<AdminProductImageResponse> {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) throw PRODUCT_NOT_FOUND();

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

    const uploaded = await this.imageStorage.upload(file.buffer, { productId });

    const { _max } = await this.prisma.productImage.aggregate({
      where: { productId },
      _max: { position: true },
    });
    const position = (_max.position ?? -1) + 1;

    const image = await this.prisma.$transaction(async (tx) => {
      const created = await tx.productImage.create({
        data: {
          productId,
          url: uploaded.url,
          cloudinaryPublicId: uploaded.publicId,
          position,
          altTextSv: altText.altTextSv ?? null,
          altTextEn: altText.altTextEn ?? null,
        },
      });

      await this.audit.record(
        {
          actorUserId,
          action: "product.image.uploaded",
          entityType: "Product",
          entityId: productId,
          after: { imageId: created.id, url: created.url },
          ipAddress,
        },
        tx,
      );

      return created;
    });

    return mapAdminProductImage(image);
  }

  async updateImage(
    productId: string,
    imageId: string,
    input: ProductImageAltTextInput,
    actorUserId: string,
    ipAddress?: string,
  ): Promise<AdminProductImageResponse> {
    const existing = await this.prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!existing) throw PRODUCT_IMAGE_NOT_FOUND();

    const image = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.productImage.update({
        where: { id: imageId },
        data: {
          ...(input.altTextSv !== undefined ? { altTextSv: input.altTextSv } : {}),
          ...(input.altTextEn !== undefined ? { altTextEn: input.altTextEn } : {}),
        },
      });

      await this.audit.record(
        {
          actorUserId,
          action: "product.image.updated",
          entityType: "Product",
          entityId: productId,
          before: { altTextSv: existing.altTextSv, altTextEn: existing.altTextEn },
          after: { altTextSv: updated.altTextSv, altTextEn: updated.altTextEn },
          ipAddress,
        },
        tx,
      );

      return updated;
    });

    return mapAdminProductImage(image);
  }

  async deleteImage(
    productId: string,
    imageId: string,
    actorUserId: string,
    ipAddress?: string,
  ): Promise<void> {
    const existing = await this.prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!existing) throw PRODUCT_IMAGE_NOT_FOUND();

    // Delete the Cloudinary asset before the DB row — if the external
    // delete fails, surface the error and keep the row rather than orphan
    // the asset in storage with nothing left pointing at it (the same
    // "disclosed rather than faked" posture used throughout this codebase).
    if (existing.cloudinaryPublicId) {
      await this.imageStorage.delete(existing.cloudinaryPublicId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.productImage.delete({ where: { id: imageId } });

      await this.audit.record(
        {
          actorUserId,
          action: "product.image.deleted",
          entityType: "Product",
          entityId: productId,
          before: { imageId, url: existing.url },
          ipAddress,
        },
        tx,
      );
    });
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

  // Deleting a product that has ever sold or is sitting in a live cart
  // would either falsify order history (ProductVariant->Order is a Restrict
  // FK for exactly this reason) or pull an item out from under a shopper
  // mid-checkout — so both are checked up front and rejected with a clear
  // reason instead of a raw FK-violation 500. There is deliberately no such
  // guard for status: a never-sold DRAFT or ARCHIVED product can always be
  // removed outright, which is the point of adding this at all (status
  // alone gave no way to shrink the list again).
  async deleteProduct(id: string, actorUserId: string, ipAddress?: string): Promise<void> {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        variants: { select: { id: true } },
        images: { select: { id: true, cloudinaryPublicId: true } },
      },
    });
    if (!existing) throw PRODUCT_NOT_FOUND();

    const variantIds = existing.variants.map((v) => v.id);
    if (variantIds.length > 0) {
      const [orderItemCount, cartItemCount] = await Promise.all([
        this.prisma.orderItem.count({ where: { productVariantId: { in: variantIds } } }),
        this.prisma.cartItem.count({ where: { productVariantId: { in: variantIds } } }),
      ]);
      if (orderItemCount > 0) {
        throw new ConflictException({
          error: "ProductHasOrders",
          message: "This product has existing orders and can't be deleted — archive it instead",
        });
      }
      if (cartItemCount > 0) {
        throw new ConflictException({
          error: "ProductInCarts",
          message: "This product is in a customer's cart right now and can't be deleted",
        });
      }
    }

    // Cloudinary assets aren't covered by the DB cascade below — deleted
    // the same way deleteImage() removes a single one, just for every
    // image up front so nothing is orphaned in storage.
    for (const image of existing.images) {
      if (image.cloudinaryPublicId) {
        await this.imageStorage.delete(image.cloudinaryPublicId);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // ProductVariant->Product is Restrict (unlike translations/images/
      // categories/collections/options, which cascade from Product), so
      // variants must go first.
      await tx.productVariant.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });

      await this.audit.record(
        {
          actorUserId,
          action: "product.deleted",
          entityType: "Product",
          entityId: id,
          before: { status: existing.status, variantCount: variantIds.length },
          ipAddress,
        },
        tx,
      );
    });
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
            // articleNumber is never supplied here — the database assigns
            // it itself from ProductVariant_articleNumber_seq the instant
            // this row is created (schema.prisma's own comment on the
            // field), so creation can never race, skip, or forget it.
            sku: variantInput.sku ?? null,
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
            skus: input.variants.map((v) => v.sku ?? null),
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
            message: `Variant "${variant.sku ?? "(no SKU)"}" selects "${key}=${value}", which was not declared in options[]`,
          });
        }
      }
    }
  }

  private validateUniqueSkus(input: CreateProductInput): void {
    // Blank/omitted SKUs are excluded from the uniqueness check — sku is
    // optional now that articleNumber is the permanent identifier
    // (ProductVariant's own schema comment), and Postgres's own unique
    // index already allows any number of NULLs, so two variants left
    // without one is never a real collision.
    const skus = input.variants.map((v) => v.sku).filter((sku): sku is string => !!sku);
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
