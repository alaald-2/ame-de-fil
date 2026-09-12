import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Express } from "express";
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator.ts";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodParam, ApiZodQuery, toOpenApiSchema } from "../common/zod-openapi.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { AdminProductsService } from "./admin-products.service.ts";
import { listAdminProductsQuerySchema, type ListAdminProductsQuery } from "./dto/list-products-query.dto.ts";
import { createProductSchema, type CreateProductInput } from "./dto/create-product.dto.ts";
import { updateProductSchema, type UpdateProductInput } from "./dto/update-product.dto.ts";
import { productIdParamSchema, type ProductIdParam } from "./dto/product-id.param.ts";
import { productImageIdParamSchema, type ProductImageIdParam } from "./dto/product-image-id.param.ts";
import { productImageAltTextSchema, type ProductImageAltTextInput } from "./dto/product-image.dto.ts";
import {
  reorderProductImagesSchema,
  type ReorderProductImagesInput,
} from "./dto/reorder-product-images.dto.ts";
import {
  createProductResponseSchema,
  adminProductResponseSchema,
  adminProductImageResponseSchema,
  reorderProductImagesResponseSchema,
  listAdminProductsResponseSchema,
  listAdminProductVariantOptionsResponseSchema,
} from "./dto/responses.ts";
import { localeQuerySchema, type LocaleQuery } from "../common/dto/locale-query.schema.ts";

// No @Public()/@OptionalAuth() — admin-only, default-deny, same posture as
// every other admin controller. Four permissions gate this (view/create/
// update/delete, mirroring inventory.view/.adjust or orders.view/.fulfill/
// .refund); products.create already existed as its own permission before
// this checkpoint, and products.view (read) and products.update
// (translations/status/categories/collections/variant fields) were added
// alongside it without folding status transitions into a further separate
// permission — a status change here isn't money-moving or as operationally
// distinct as e.g. orders' fulfill/refund split. products.delete is its own
// permission (not folded into .update) because it's the one irreversible
// operation on this controller — an admin can be trusted to edit or
// archive products without being trusted to permanently remove them.
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/products")
export class AdminProductsController {
  constructor(private readonly adminProducts: AdminProductsService) {}

  @Get()
  @RequirePermissions("products.view")
  @ApiOperation({
    summary: "List products (admin), most recently updated first — optionally filtered to one status",
  })
  @ApiZodQuery(listAdminProductsQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listAdminProductsResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async list(@Query(new ZodValidationPipe(listAdminProductsQuerySchema)) query: ListAdminProductsQuery) {
    return this.adminProducts.list(query.page, query.pageSize, query.status, query.q);
  }

  // Registered before ":id" — Nest matches routes in registration order,
  // same reasoning as admin-orders.controller.ts's own "export" route
  // (otherwise ":id" would swallow "variants" as a literal id).
  @Get("variants")
  @RequirePermissions("products.view")
  @ApiOperation({ summary: "List every non-archived variant, for pickers like the Promotions admin UI" })
  @ApiZodQuery(localeQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listAdminProductVariantOptionsResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async listVariantOptions(@Query(new ZodValidationPipe(localeQuerySchema)) query: LocaleQuery) {
    return this.adminProducts.listVariantOptions(query.locale);
  }

  @Get(":id")
  @RequirePermissions("products.view")
  @ApiOperation({ summary: "Get a product's full editable content (every locale, all variants)" })
  @ApiZodParam(productIdParamSchema)
  @ApiOkResponse({ schema: toOpenApiSchema(adminProductResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404)
  async getOne(@Param(new ZodValidationPipe(productIdParamSchema)) params: ProductIdParam) {
    return this.adminProducts.getOne(params.id);
  }

  @Post()
  @RequirePermissions("products.create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a product with its translations, options, and variants" })
  @ApiBody({ schema: toOpenApiSchema(createProductSchema) })
  @ApiCreatedResponse({ schema: toOpenApiSchema(createProductResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async create(
    @Body(new ZodValidationPipe(createProductSchema)) body: CreateProductInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.adminProducts.createProduct(body, auth.userId, request.ip);
  }

  @Patch(":id")
  @RequirePermissions("products.update")
  @ApiOperation({
    summary:
      "Update a product's translations, category/collection membership, status, or existing variants' fields",
  })
  @ApiZodParam(productIdParamSchema)
  @ApiBody({ schema: toOpenApiSchema(updateProductSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(adminProductResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async update(
    @Param(new ZodValidationPipe(productIdParamSchema)) params: ProductIdParam,
    @Body(new ZodValidationPipe(updateProductSchema)) body: UpdateProductInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.adminProducts.update(params.id, body, auth.userId, request.ip);
  }

  @Post(":id/images")
  @RequirePermissions("products.update")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiOperation({ summary: "Upload a product image (JPEG/PNG/WebP, 5MB max)" })
  @ApiZodParam(productIdParamSchema)
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: { type: "string", format: "binary" },
        altTextSv: { type: "string" },
        altTextEn: { type: "string" },
      },
    },
  })
  @ApiCreatedResponse({ schema: toOpenApiSchema(adminProductImageResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404)
  async uploadImage(
    @Param(new ZodValidationPipe(productIdParamSchema)) params: ProductIdParam,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(productImageAltTextSchema)) body: ProductImageAltTextInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    if (!file) {
      throw new BadRequestException({ error: "MissingFile", message: "An image file is required" });
    }
    return this.adminProducts.uploadImage(
      params.id,
      { buffer: file.buffer, mimetype: file.mimetype },
      body,
      auth.userId,
      request.ip,
    );
  }

  // Must be declared before @Patch(":id/images/:imageId") below — Nest/
  // Express match routes in registration order, and ":imageId" would
  // otherwise swallow "order" as a literal image id (same route-ordering
  // hazard inventory.controller.ts's own "low-stock"/"reservations"/
  // "movements" routes guard against, ahead of their own ":variantId").
  @Patch(":id/images/order")
  @RequirePermissions("products.update")
  @ApiOperation({ summary: "Reorder a product's images (the full, ordered list of image ids)" })
  @ApiZodParam(productIdParamSchema)
  @ApiBody({ schema: toOpenApiSchema(reorderProductImagesSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(reorderProductImagesResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404)
  async reorderImages(
    @Param(new ZodValidationPipe(productIdParamSchema)) params: ProductIdParam,
    @Body(new ZodValidationPipe(reorderProductImagesSchema)) body: ReorderProductImagesInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.adminProducts.reorderImages(params.id, body.imageIds, auth.userId, request.ip);
  }

  @Patch(":id/images/:imageId")
  @RequirePermissions("products.update")
  @ApiOperation({ summary: "Update a product image's alt text" })
  @ApiZodParam(productImageIdParamSchema)
  @ApiBody({ schema: toOpenApiSchema(productImageAltTextSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(adminProductImageResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404)
  async updateImage(
    @Param(new ZodValidationPipe(productImageIdParamSchema)) params: ProductImageIdParam,
    @Body(new ZodValidationPipe(productImageAltTextSchema)) body: ProductImageAltTextInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.adminProducts.updateImage(params.id, params.imageId, body, auth.userId, request.ip);
  }

  @Delete(":id/images/:imageId")
  @RequirePermissions("products.update")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a product image" })
  @ApiZodParam(productImageIdParamSchema)
  @ApiNoContentResponse()
  @ApiErrorResponses(401, 403, 404)
  async deleteImage(
    @Param(new ZodValidationPipe(productImageIdParamSchema)) params: ProductImageIdParam,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    await this.adminProducts.deleteImage(params.id, params.imageId, auth.userId, request.ip);
  }

  @Delete(":id")
  @RequirePermissions("products.delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      "Delete a product outright (only when it has never been ordered or added to a live cart — use status=ARCHIVED instead for anything that has sold)",
  })
  @ApiZodParam(productIdParamSchema)
  @ApiNoContentResponse()
  @ApiErrorResponses(401, 403, 404, 409)
  async delete(
    @Param(new ZodValidationPipe(productIdParamSchema)) params: ProductIdParam,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    await this.adminProducts.deleteProduct(params.id, auth.userId, request.ip);
  }
}
