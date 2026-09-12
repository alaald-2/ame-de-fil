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
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator.ts";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodParam, ApiZodQuery, toOpenApiSchema } from "../common/zod-openapi.ts";
import { listTaxonomyQuerySchema, type ListTaxonomyQuery } from "./dto/list-taxonomy-query.dto.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { AdminCollectionsService } from "./admin-collections.service.ts";
import { createTaxonomySchema, updateTaxonomySchema, type CreateTaxonomyInput, type UpdateTaxonomyInput } from "./dto/taxonomy.dto.ts";
import { taxonomyIdParamSchema, type TaxonomyIdParam } from "./dto/taxonomy-id.param.ts";
import {
  createTaxonomyResponseSchema,
  adminTaxonomyResponseSchema,
  listAdminTaxonomyResponseSchema,
} from "./dto/responses.ts";

// Mirror of admin-categories.controller.ts, driving AdminCollectionsService
// instead — see that file's top comment for the permission-split rationale.
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/collections")
export class AdminCollectionsController {
  constructor(private readonly adminCollections: AdminCollectionsService) {}

  @Get()
  @RequirePermissions("collections.view")
  @ApiOperation({ summary: "List collections with product counts, most recently updated first" })
  @ApiZodQuery(listTaxonomyQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listAdminTaxonomyResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async list(@Query(new ZodValidationPipe(listTaxonomyQuerySchema)) query: ListTaxonomyQuery) {
    return this.adminCollections.list(query.page, query.pageSize, query.q);
  }

  @Get(":id")
  @RequirePermissions("collections.view")
  @ApiOperation({ summary: "Get a collection's full editable content (every locale)" })
  @ApiZodParam(taxonomyIdParamSchema)
  @ApiOkResponse({ schema: toOpenApiSchema(adminTaxonomyResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404)
  async getOne(@Param(new ZodValidationPipe(taxonomyIdParamSchema)) params: TaxonomyIdParam) {
    return this.adminCollections.getOne(params.id);
  }

  @Post()
  @RequirePermissions("collections.manage")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a collection with its translations" })
  @ApiBody({ schema: toOpenApiSchema(createTaxonomySchema) })
  @ApiCreatedResponse({ schema: toOpenApiSchema(createTaxonomyResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 409)
  async create(
    @Body(new ZodValidationPipe(createTaxonomySchema)) body: CreateTaxonomyInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.adminCollections.create(body, auth.userId, request.ip);
  }

  @Patch(":id")
  @RequirePermissions("collections.manage")
  @ApiOperation({ summary: "Update a collection's translations" })
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
    return this.adminCollections.update(params.id, body, auth.userId, request.ip);
  }

  @Delete(":id")
  @RequirePermissions("collections.manage")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a collection; blocked (409) while any product is tagged with it" })
  @ApiZodParam(taxonomyIdParamSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async remove(
    @Param(new ZodValidationPipe(taxonomyIdParamSchema)) params: TaxonomyIdParam,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    await this.adminCollections.remove(params.id, auth.userId, request.ip);
  }
}
