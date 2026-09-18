import {
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
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import type { z } from "zod";
import { CurrentUser } from "../common/decorators/current-user.decorator.ts";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodParam, ApiZodQuery, toOpenApiSchema } from "../common/zod-openapi.ts";
import { paginationQuerySchema } from "../common/dto/pagination.schema.ts";
import { searchQuerySchema } from "../common/dto/search-query.schema.ts";
import { localeQuerySchema, type LocaleQuery } from "../common/dto/locale-query.schema.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { PromotionsService } from "./promotions.service.ts";
import { createPromotionSchema, type CreatePromotionInput } from "./dto/create-promotion.dto.ts";
import { updatePromotionSchema, type UpdatePromotionInput } from "./dto/update-promotion.dto.ts";
import {
  promotionIdParamSchema,
  promotionVariantParamSchema,
  type PromotionIdParam,
  type PromotionVariantParam,
} from "./dto/promotion-id.param.ts";
import {
  createPromotionResponseSchema,
  adminPromotionResponseSchema,
  listAdminPromotionsResponseSchema,
} from "./dto/responses.ts";

// `q` matches the promotion's own name — see promotions.service.ts's list().
const listPromotionsQuerySchema = paginationQuerySchema.extend({
  ...searchQuerySchema.shape,
});
type ListPromotionsQuery = z.infer<typeof listPromotionsQuerySchema>;

// Admin-only, default-deny, same posture as every other admin controller
// (see admin-products.controller.ts's own comment for the fuller
// rationale). Two permissions: promotions.view (read) and
// promotions.manage (create/update, which covers activate/deactivate —
// both are just `active` in a PATCH body, not separate actions) — mirrors
// categories.view/categories.manage, the closest existing precedent for a
// small, single-owner admin area, rather than products' finer-grained
// view/create/update/delete split (there's no delete here at all: a
// Promotion can be deactivated but never removed, since OrderItem.promotionId
// is a real FK to it — see schema.prisma's own comment on that column).
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/promotions")
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  @RequirePermissions("promotions.view")
  @ApiOperation({ summary: "List promotions, most recently updated first" })
  @ApiZodQuery(listPromotionsQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listAdminPromotionsResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async list(@Query(new ZodValidationPipe(listPromotionsQuerySchema)) query: ListPromotionsQuery) {
    return this.promotions.list(query.page, query.pageSize, query.q);
  }

  @Get(":id")
  @RequirePermissions("promotions.view")
  @ApiOperation({ summary: "Get a promotion and the variants it applies to" })
  @ApiZodParam(promotionIdParamSchema)
  @ApiZodQuery(localeQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(adminPromotionResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404)
  async getOne(
    @Param(new ZodValidationPipe(promotionIdParamSchema)) params: PromotionIdParam,
    @Query(new ZodValidationPipe(localeQuerySchema)) query: LocaleQuery,
  ) {
    return this.promotions.getOne(params.id, query.locale);
  }

  @Post()
  @RequirePermissions("promotions.manage")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a percentage promotion and attach it to one or more variants" })
  @ApiBody({ schema: toOpenApiSchema(createPromotionSchema) })
  @ApiCreatedResponse({ schema: toOpenApiSchema(createPromotionResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 409)
  async create(
    @Body(new ZodValidationPipe(createPromotionSchema)) body: CreatePromotionInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.promotions.create(body, auth.userId, request.ip);
  }

  @Patch(":id")
  @RequirePermissions("promotions.manage")
  @ApiOperation({
    summary:
      "Update a promotion's name/percentage/dates/active state and/or replace its full variant set",
  })
  @ApiZodParam(promotionIdParamSchema)
  @ApiBody({ schema: toOpenApiSchema(updatePromotionSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(adminPromotionResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async update(
    @Param(new ZodValidationPipe(promotionIdParamSchema)) params: PromotionIdParam,
    @Body(new ZodValidationPipe(updatePromotionSchema)) body: UpdatePromotionInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.promotions.update(params.id, body, auth.userId, request.ip);
  }

  // Lets the Products admin page ("remove promotion" on a single variant
  // card) detach a variant without opening the Promotions area at all —
  // see promotions.service.ts's removeVariant for why this is a thin
  // wrapper around update() rather than its own write path.
  @Delete(":id/variants/:variantId")
  @RequirePermissions("promotions.manage")
  @ApiOperation({ summary: "Detach one variant from a promotion" })
  @ApiZodParam(promotionVariantParamSchema)
  @ApiOkResponse({ schema: toOpenApiSchema(adminPromotionResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async removeVariant(
    @Param(new ZodValidationPipe(promotionVariantParamSchema)) params: PromotionVariantParam,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.promotions.removeVariant(params.id, params.variantId, auth.userId, request.ip);
  }
}
