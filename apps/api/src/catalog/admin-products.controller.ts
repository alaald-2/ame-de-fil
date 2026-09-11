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
import { paginationQuerySchema, type PaginationQuery } from "../common/dto/pagination.schema.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { AdminProductsService } from "./admin-products.service.ts";
import { createProductSchema, type CreateProductInput } from "./dto/create-product.dto.ts";
import { updateProductSchema, type UpdateProductInput } from "./dto/update-product.dto.ts";
import { productIdParamSchema, type ProductIdParam } from "./dto/product-id.param.ts";
import { productImageIdParamSchema, type ProductImageIdParam } from "./dto/product-image-id.param.ts";
import { productImageAltTextSchema, type ProductImageAltTextInput } from "./dto/product-image.dto.ts";
import {
  createProductResponseSchema,
  adminProductResponseSchema,
  adminProductImageResponseSchema,
  listAdminProductsResponseSchema,
} from "./dto/responses.ts";

// No @Public()/@OptionalAuth() — admin-only, default-deny, same posture as
// every other admin controller. Three permissions could have gated this
// (view/create/update, mirroring inventory.view/.adjust or orders.view/
// .fulfill/.refund), but products.create already existed as its own
// permission before this checkpoint; adding products.view (read) and
// products.update (translations/status/categories/collections/variant
// fields) alongside it, without folding status transitions into a further
// separate permission — a status change here isn't money-moving or as
// operationally distinct as e.g. orders' fulfill/refund split.
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/products")
export class AdminProductsController {
  constructor(private readonly adminProducts: AdminProductsService) {}

  @Get()
  @RequirePermissions("products.view")
  @ApiOperation({ summary: "List products in every status (admin), most recently updated first" })
  @ApiZodQuery(paginationQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listAdminProductsResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async list(@Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery) {
    return this.adminProducts.list(query.page, query.pageSize);
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
}
