import type { operations } from "./generated/api-schema.ts";

// Convenience aliases over the raw generated `operations` indexed-access
// types — response shapes are inline (not named OpenAPI components, since
// apps/api documents them via zod-openapi's bridge rather than
// @nestjs/swagger's class-based DTOs), so both apps/storefront and
// apps/admin would otherwise repeat this same verbose indexing themselves.
export type ProductListResponse =
  operations["ProductsController_list"]["responses"][200]["content"]["application/json"];
export type Product = ProductListResponse["items"][number];

export type ProductDetailResponse =
  operations["ProductsController_getBySlug"]["responses"][200]["content"]["application/json"];

export type CategoryListResponse =
  operations["CategoriesController_list"]["responses"][200]["content"]["application/json"];
export type Category = CategoryListResponse[number];

export type CategoryDetailResponse =
  operations["CategoriesController_getBySlug"]["responses"][200]["content"]["application/json"];

export type CollectionListResponse =
  operations["CollectionsController_list"]["responses"][200]["content"]["application/json"];
export type Collection = CollectionListResponse[number];

export type CollectionDetailResponse =
  operations["CollectionsController_getBySlug"]["responses"][200]["content"]["application/json"];
