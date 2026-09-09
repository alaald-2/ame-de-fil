import { BadRequestException, Injectable } from "@nestjs/common";
import { Currency } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";
import { toPrismaLocale } from "../common/locale.ts";
import type { CreateProductInput } from "./dto/create-product.dto.ts";

@Injectable()
export class AdminProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async createProduct(input: CreateProductInput): Promise<{ id: string }> {
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
