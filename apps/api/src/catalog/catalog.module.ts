import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { AuditModule } from "../audit/audit.module.ts";
import { ProductsController } from "./products.controller.ts";
import { ProductsService } from "./products.service.ts";
import { CategoriesController } from "./categories.controller.ts";
import { CategoriesService } from "./categories.service.ts";
import { CollectionsController } from "./collections.controller.ts";
import { CollectionsService } from "./collections.service.ts";
import { AdminProductsController } from "./admin-products.controller.ts";
import { AdminProductsService } from "./admin-products.service.ts";
import { AdminCategoriesController } from "./admin-categories.controller.ts";
import { AdminCategoriesService } from "./admin-categories.service.ts";
import { AdminCollectionsController } from "./admin-collections.controller.ts";
import { AdminCollectionsService } from "./admin-collections.service.ts";
import { AdminTaxClassesController } from "./admin-tax-classes.controller.ts";
import {
  IMAGE_STORAGE_PROVIDER,
  PendingImageStorageProvider,
  CloudinaryImageStorageProvider,
  type ImageStorageProvider,
} from "./images/image-storage.provider.ts";

// Products/variants/categories/collections (ARCHITECTURE.md §3). Read
// endpoints are public; admin mutations (create/update product, and full
// CRUD on categories/collections) are permission-gated (SECURITY.md §2) —
// see admin-products.controller.ts / admin-categories.controller.ts /
// admin-collections.controller.ts. AdminTaxClassesController is a tiny
// read-only reference catalog reusing AdminProductsService/products.view —
// see its own top comment.
//
// IMAGE_STORAGE_PROVIDER resolves to CloudinaryImageStorageProvider when
// Cloudinary is configured, PendingImageStorageProvider (no upload
// attempted) otherwise — the same factory idiom as PAYMENT_PROVIDER/
// EMAIL_PROVIDER (DECISIONS.md ADR-034). CloudinaryImageStorageProvider is
// deliberately not registered as its own standalone provider — Nest would
// eagerly construct it (and its config.get calls would return undefined
// rather than throw, silently misconfiguring the SDK) on every boot,
// defeating the fallback. This is catalog-only, unlike Payments/
// Notifications which cross module boundaries, so it's a plain provider
// here rather than its own top-level module.
@Module({
  imports: [AuditModule],
  controllers: [
    ProductsController,
    CategoriesController,
    CollectionsController,
    AdminProductsController,
    AdminCategoriesController,
    AdminCollectionsController,
    AdminTaxClassesController,
  ],
  providers: [
    ProductsService,
    CategoriesService,
    CollectionsService,
    AdminProductsService,
    AdminCategoriesService,
    AdminCollectionsService,
    {
      provide: IMAGE_STORAGE_PROVIDER,
      useFactory: (config: ConfigService<Env, true>): ImageStorageProvider => {
        const configured =
          Boolean(config.get("CLOUDINARY_CLOUD_NAME", { infer: true })) &&
          Boolean(config.get("CLOUDINARY_API_KEY", { infer: true })) &&
          Boolean(config.get("CLOUDINARY_API_SECRET", { infer: true }));
        return configured ? new CloudinaryImageStorageProvider(config) : new PendingImageStorageProvider();
      },
      inject: [ConfigService],
    },
  ],
})
export class CatalogModule {}
