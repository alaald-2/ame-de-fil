import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodParam, ApiZodQuery, toOpenApiSchema } from "../common/zod-openapi.ts";
import { CategoriesService } from "./categories.service.ts";
import { localeQuerySchema, type LocaleQuery } from "../common/dto/locale-query.schema.ts";
import { slugParamSchema, type SlugParam } from "./dto/common.schemas.ts";
import {
  detailWithProductsQuerySchema,
  type DetailWithProductsQuery,
} from "./dto/detail-with-products-query.dto.ts";
import { categoryResponseSchema, categoryWithProductsResponseSchema } from "./dto/responses.ts";
import { z } from "zod";

@ApiTags("catalog")
@Controller("categories")
@Public()
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: "List all categories" })
  @ApiZodQuery(localeQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(categoryResponseSchema)) })
  @ApiErrorResponses(400)
  async list(@Query(new ZodValidationPipe(localeQuerySchema)) query: LocaleQuery) {
    return this.categories.list(query.locale);
  }

  @Get(":slug")
  @ApiOperation({
    summary: "Get a category by its locale-specific slug, with its published products",
  })
  @ApiZodParam(slugParamSchema)
  @ApiZodQuery(detailWithProductsQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(categoryWithProductsResponseSchema) })
  @ApiErrorResponses(400, 404)
  async getBySlug(
    @Param(new ZodValidationPipe(slugParamSchema)) params: SlugParam,
    @Query(new ZodValidationPipe(detailWithProductsQuerySchema)) query: DetailWithProductsQuery,
  ) {
    return this.categories.getBySlug(params.slug, query.locale, query.page, query.pageSize);
  }
}
