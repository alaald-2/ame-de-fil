import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
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
import {
  createProductResponseSchema,
  adminProductResponseSchema,
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
}
