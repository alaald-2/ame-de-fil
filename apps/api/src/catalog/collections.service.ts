import { Injectable, NotFoundException } from "@nestjs/common";
import { ProductStatus } from "@ame-de-fil/database";
import type { Locale as AppLocale } from "@ame-de-fil/validation";
import { PrismaService } from "../database/prisma.service.ts";
import {
  mapCollection,
  COLLECTION_GALLERY_IMAGE_LIMIT,
  type CollectionResponse,
} from "./mappers/collection.mapper.ts";
import {
  mapProduct,
  PRODUCT_INCLUDE,
  collectVariantIds,
  type ProductResponse,
} from "./mappers/product.mapper.ts";
import { resolveActivePromotionsForVariants } from "../promotions/effective-price.ts";

const DEFAULT_LOCALE: AppLocale = "sv-SE";

export interface CollectionWithProducts extends CollectionResponse {
  products: ProductResponse[];
  productsPage: number;
  productsPageSize: number;
  productsTotal: number;
}

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(locale: AppLocale): Promise<CollectionResponse[]> {
    const rows = await this.prisma.collection.findMany({
      include: {
        translations: true,
        products: {
          where: { product: { status: ProductStatus.PUBLISHED } },
          take: COLLECTION_GALLERY_IMAGE_LIMIT,
          orderBy: { product: { createdAt: "desc" } },
          include: { product: { include: { images: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return rows
      .map((row) => mapCollection(row, locale, DEFAULT_LOCALE))
      .filter((c): c is CollectionResponse => c !== null);
  }

  async getBySlug(
    slug: string,
    locale: AppLocale,
    page: number,
    pageSize: number,
  ): Promise<CollectionWithProducts> {
    const collection = await this.prisma.collection.findFirst({
      where: { translations: { some: { slug } } },
      include: {
        translations: true,
        products: {
          where: { product: { status: ProductStatus.PUBLISHED } },
          take: COLLECTION_GALLERY_IMAGE_LIMIT,
          orderBy: { product: { createdAt: "desc" } },
          include: { product: { include: { images: true } } },
        },
      },
    });

    if (!collection) {
      throw new NotFoundException({
        error: "CollectionNotFound",
        message: `No collection for slug "${slug}"`,
      });
    }

    const mapped = mapCollection(collection, locale, DEFAULT_LOCALE);
    if (!mapped) {
      throw new NotFoundException({
        error: "CollectionNotFound",
        message: `Collection "${slug}" has no translation in "${locale}" or the default locale`,
      });
    }

    const where = {
      status: ProductStatus.PUBLISHED,
      collections: { some: { collectionId: collection.id } },
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

    const promotions = await resolveActivePromotionsForVariants(
      this.prisma,
      collectVariantIds(productRows),
      new Date(),
    );
    const products = productRows
      .map((row) => mapProduct(row, locale, DEFAULT_LOCALE, promotions))
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
