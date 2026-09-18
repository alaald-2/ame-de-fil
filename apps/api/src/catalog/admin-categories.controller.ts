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
import { CurrentUser } from "../common/decorators/current-user.decorator.ts";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodParam, ApiZodQuery, toOpenApiSchema } from "../common/zod-openapi.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { AdminCategoriesService } from "./admin-categories.service.ts";
import { listTaxonomyQuerySchema, type ListTaxonomyQuery } from "./dto/list-taxonomy-query.dto.ts";
import {
  createTaxonomySchema,
  updateTaxonomySchema,
  type CreateTaxonomyInput,
  type UpdateTaxonomyInput,
} from "./dto/taxonomy.dto.ts";
import { taxonomyIdParamSchema, type TaxonomyIdParam } from "./dto/taxonomy-id.param.ts";
import {
  createTaxonomyResponseSchema,
  adminTaxonomyResponseSchema,
  listAdminTaxonomyResponseSchema,
} from "./dto/responses.ts";

// No @Public() — admin-only, default-deny. One view/manage permission pair
// (not split further into create/update/delete) — see the approved plan's
// rationale: none of these mutations carry the risk profile that justified
// Orders' finer view/fulfill/refund split.
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/categories")
export class AdminCategoriesController {
  constructor(private readonly adminCategories: AdminCategoriesService) {}

  @Get()
  @RequirePermissions("categories.view")
  @ApiOperation({ summary: "List categories with product counts, most recently updated first" })
  @ApiZodQuery(listTaxonomyQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listAdminTaxonomyResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async list(@Query(new ZodValidationPipe(listTaxonomyQuerySchema)) query: ListTaxonomyQuery) {
    return this.adminCategories.list(query.page, query.pageSize, query.q);
  }

  @Get(":id")
  @RequirePermissions("categories.view")
  @ApiOperation({ summary: "Get a category's full editable content (every locale)" })
  @ApiZodParam(taxonomyIdParamSchema)
  @ApiOkResponse({ schema: toOpenApiSchema(adminTaxonomyResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404)
  async getOne(@Param(new ZodValidationPipe(taxonomyIdParamSchema)) params: TaxonomyIdParam) {
    return this.adminCategories.getOne(params.id);
  }

  @Post()
  @RequirePermissions("categories.manage")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a category with its translations" })
  @ApiBody({ schema: toOpenApiSchema(createTaxonomySchema) })
  @ApiCreatedResponse({ schema: toOpenApiSchema(createTaxonomyResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 409)
  async create(
    @Body(new ZodValidationPipe(createTaxonomySchema)) body: CreateTaxonomyInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.adminCategories.create(body, auth.userId, request.ip);
  }

  @Patch(":id")
  @RequirePermissions("categories.manage")
  @ApiOperation({ summary: "Update a category's translations" })
  @ApiZodParam(taxonomyIdParamSchema)
  @ApiBody({ schema: toOpenApiSchema(updateTaxonomySchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(adminTaxonomyResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async update(
    @Param(new ZodValidationPipe(taxonomyIdParamSchema)) params: TaxonomyIdParam,
    @Body(new ZodValidationPipe(updateTaxonomySchema)) body: UpdateTaxonomyInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.adminCategories.update(params.id, body, auth.userId, request.ip);
  }

  @Delete(":id")
  @RequirePermissions("categories.manage")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a category; blocked (409) while any product is tagged with it" })
  @ApiZodParam(taxonomyIdParamSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async remove(
    @Param(new ZodValidationPipe(taxonomyIdParamSchema)) params: TaxonomyIdParam,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    await this.adminCategories.remove(params.id, auth.userId, request.ip);
  }
}
