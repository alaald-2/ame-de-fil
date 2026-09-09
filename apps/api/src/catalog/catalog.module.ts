import { Module } from "@nestjs/common";
import { ProductsController } from "./products.controller.ts";
import { ProductsService } from "./products.service.ts";
import { CategoriesController } from "./categories.controller.ts";
import { CategoriesService } from "./categories.service.ts";
import { CollectionsController } from "./collections.controller.ts";
import { CollectionsService } from "./collections.service.ts";
import { AdminProductsController } from "./admin-products.controller.ts";
import { AdminProductsService } from "./admin-products.service.ts";

// Products/variants/categories/collections (ARCHITECTURE.md §3). Read
// endpoints are public; the one admin mutation (create product) is
// permission-gated (SECURITY.md §2) — see admin-products.controller.ts.
@Module({
  controllers: [
    ProductsController,
    CategoriesController,
    CollectionsController,
    AdminProductsController,
  ],
  providers: [ProductsService, CategoriesService, CollectionsService, AdminProductsService],
})
export class CatalogModule {}
