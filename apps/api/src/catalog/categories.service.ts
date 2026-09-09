import { Injectable, NotFoundException } from "@nestjs/common";
import { ProductStatus } from "@ame-de-fil/database";
import type { Locale as AppLocale } from "@ame-de-fil/validation";
import { PrismaService } from "../database/prisma.service.ts";
import { mapCategory, type CategoryResponse } from "./mappers/category.mapper.ts";
import { mapProduct, PRODUCT_INCLUDE, type ProductResponse } from "./mappers/product.mapper.ts";

const DEFAULT_LOCALE: AppLocale = "sv-SE";

export interface CategoryWithProducts extends CategoryResponse {
  products: ProductResponse[];
  productsPage: number;
  productsPageSize: number;
  productsTotal: number;
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(locale: AppLocale): Promise<CategoryResponse[]> {
    const rows = await this.prisma.category.findMany({
      include: { translations: true },
      orderBy: { createdAt: "asc" },
    });
    return rows
      .map((row) => mapCategory(row, locale, DEFAULT_LOCALE))
      .filter((c): c is CategoryResponse => c !== null);
  }

  async getBySlug(
    slug: string,
    locale: AppLocale,
    page: number,
    pageSize: number,
  ): Promise<CategoryWithProducts> {
    const category = await this.prisma.category.findFirst({
      where: { translations: { some: { slug } } },
      include: { translations: true },
    });

    if (!category) {
      throw new NotFoundException({
        error: "CategoryNotFound",
        message: `No category for slug "${slug}"`,
      });
    }

    const mapped = mapCategory(category, locale, DEFAULT_LOCALE);
    if (!mapped) {
      throw new NotFoundException({
        error: "CategoryNotFound",
        message: `Category "${slug}" has no translation in "${locale}" or the default locale`,
      });
    }

    const where = {
      status: ProductStatus.PUBLISHED,
      categories: { some: { categoryId: category.id } },
    };

    const [productRows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.product.count({ where }),
    ]);

    const products = productRows
      .map((row) => mapProduct(row, locale, DEFAULT_LOCALE))
      .filter((p): p is ProductResponse => p !== null);

    return {
      ...mapped,
      products,
      productsPage: page,
      productsPageSize: pageSize,
      productsTotal: total,
    };
  }
}
