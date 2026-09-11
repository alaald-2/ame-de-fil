import { Module } from "@nestjs/common";
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

// Products/variants/categories/collections (ARCHITECTURE.md §3). Read
// endpoints are public; admin mutations (create/update product, and full
// CRUD on categories/collections) are permission-gated (SECURITY.md §2) —
// see admin-products.controller.ts / admin-categories.controller.ts /
// admin-collections.controller.ts.
@Module({
  imports: [AuditModule],
  controllers: [
    ProductsController,
    CategoriesController,
    CollectionsController,
    AdminProductsController,
    AdminCategoriesController,
    AdminCollectionsController,
  ],
  providers: [
    ProductsService,
    CategoriesService,
    CollectionsService,
    AdminProductsService,
    AdminCategoriesService,
    AdminCollectionsService,
  ],
})
export class CatalogModule {}
