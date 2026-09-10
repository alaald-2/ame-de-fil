import { Body, Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator.ts";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { toOpenApiSchema } from "../common/zod-openapi.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { AdminProductsService } from "./admin-products.service.ts";
import { createProductSchema, type CreateProductInput } from "./dto/create-product.dto.ts";
import { createProductResponseSchema } from "./dto/responses.ts";

// No @Public() here — SessionAuthGuard (default-deny) and PermissionsGuard
// both apply, globally, exactly as for every other controller. The
// "products.create" permission check below is the *authoritative*
// authorization boundary for this mutation — apps/admin's proxy.ts
// session-cookie check is a routing/UI convenience only, never a substitute
// for this (explicitly reaffirmed, not weakened, this checkpoint).
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/products")
export class AdminProductsController {
  constructor(private readonly adminProducts: AdminProductsService) {}

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
}
