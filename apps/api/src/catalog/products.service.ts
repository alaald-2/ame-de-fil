import { Injectable, NotFoundException } from "@nestjs/common";
import { ProductStatus } from "@ame-de-fil/database";
import type { Locale as AppLocale } from "@ame-de-fil/validation";
import { PrismaService } from "../database/prisma.service.ts";
import { mapProduct, PRODUCT_INCLUDE, collectVariantIds, type ProductResponse } from "./mappers/product.mapper.ts";
import { resolveActivePromotionsForVariants } from "../promotions/effective-price.ts";

const DEFAULT_LOCALE: AppLocale = "sv-SE";

export interface ListProductsFilters {
  locale: AppLocale;
  category?: string;
  collection?: string;
  page: number;
  pageSize: number;
}

export interface ListProductsResult {
  items: ProductResponse[];
  page: number;
  pageSize: number;
  total: number;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // Only PUBLISHED products are ever visible through this read path — draft/
  // archived products exist for admin management but must never appear on
  // the storefront (PRODUCT_SPEC.md §5 admin publish/unpublish workflow).
  async list(filters: ListProductsFilters): Promise<ListProductsResult> {
    const where = {
      status: ProductStatus.PUBLISHED,
      ...(filters.category ? { categories: { some: { category: { id: filters.category } } } } : {}),
      ...(filters.collection
        ? { collections: { some: { collection: { id: filters.collection } } } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.product.count({ where }),
    ]);

    const promotions = await resolveActivePromotionsForVariants(
      this.prisma,
      collectVariantIds(rows),
      new Date(),
    );
    const items = rows
      .map((row) => mapProduct(row, filters.locale, DEFAULT_LOCALE, promotions))
      .filter((p): p is ProductResponse => p !== null);

    return { items, page: filters.page, pageSize: filters.pageSize, total };
  }

  async getBySlug(slug: string, locale: AppLocale): Promise<ProductResponse> {
    // Slugs are per-translation/per-locale (SEO.md §2) — look up the product
    // via a matching translation row in *either* supported locale, since a
    // visitor might land on a Swedish- or English-slugged link regardless of
    // their current locale; the product itself is locale-independent, only
    // its slug and content are locale-specific.
    const product = await this.prisma.product.findFirst({
      where: {
        status: ProductStatus.PUBLISHED,
        translations: { some: { slug } },
      },
      include: PRODUCT_INCLUDE,
    });

    if (!product) {
      throw new NotFoundException({
        error: "ProductNotFound",
        message: `No product for slug "${slug}"`,
      });
    }

    const promotions = await resolveActivePromotionsForVariants(
      this.prisma,
      collectVariantIds([product]),
      new Date(),
    );
    const mapped = mapProduct(product, locale, DEFAULT_LOCALE, promotions);
    if (!mapped) {
      // Exists, but has no translation in the requested *or* default locale
      // — a genuinely broken data state (every product should have at least
      // the default-locale translation), not a normal 404.
      throw new NotFoundException({
        error: "ProductNotFound",
        message: `Product "${slug}" has no translation in "${locale}" or the default locale`,
      });
    }

    return mapped;
  }
}
