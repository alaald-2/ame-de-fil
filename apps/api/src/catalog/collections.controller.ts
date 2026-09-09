import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiZodParam, ApiZodQuery, toOpenApiSchema } from "../common/zod-openapi.ts";
import { CollectionsService } from "./collections.service.ts";
import {
  localeQuerySchema,
  slugParamSchema,
  type LocaleQuery,
  type SlugParam,
} from "./dto/common.schemas.ts";
import {
  detailWithProductsQuerySchema,
  type DetailWithProductsQuery,
} from "./dto/list-collection-query.ts";
import { collectionResponseSchema, collectionWithProductsResponseSchema } from "./dto/responses.ts";
import { z } from "zod";

@ApiTags("catalog")
@Controller("collections")
@Public()
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get()
  @ApiOperation({ summary: "List all collections" })
  @ApiZodQuery(localeQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(collectionResponseSchema)) })
  async list(@Query(new ZodValidationPipe(localeQuerySchema)) query: LocaleQuery) {
    return this.collections.list(query.locale);
  }

  @Get(":slug")
  @ApiOperation({
    summary: "Get a collection by its locale-specific slug, with its published products",
  })
  @ApiZodParam(slugParamSchema)
  @ApiZodQuery(detailWithProductsQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(collectionWithProductsResponseSchema) })
  async getBySlug(
    @Param(new ZodValidationPipe(slugParamSchema)) params: SlugParam,
    @Query(new ZodValidationPipe(detailWithProductsQuerySchema)) query: DetailWithProductsQuery,
  ) {
    return this.collections.getBySlug(params.slug, query.locale, query.page, query.pageSize);
  }
}
