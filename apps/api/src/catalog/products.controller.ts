import { Controller, Get, Param, Query, UsePipes } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodParam, ApiZodQuery, toOpenApiSchema } from "../common/zod-openapi.ts";
import { ProductsService } from "./products.service.ts";
import { listProductsQuerySchema, type ListProductsQuery } from "./dto/list-products-query.dto.ts";
import { localeQuerySchema, type LocaleQuery } from "../common/dto/locale-query.schema.ts";
import { slugParamSchema, type SlugParam } from "./dto/common.schemas.ts";
import { listProductsResponseSchema, productResponseSchema } from "./dto/responses.ts";

// Read-only, public (@Public — no session required to browse the storefront).
// Only PUBLISHED products are ever returned (ProductsService.list/getBySlug).
@ApiTags("catalog")
@Controller("products")
@Public()
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({
    summary: "List published products, optionally filtered by category/collection/search term",
  })
  @ApiZodQuery(listProductsQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listProductsResponseSchema) })
  @ApiErrorResponses(400)
  @UsePipes(new ZodValidationPipe(listProductsQuerySchema))
  async list(@Query() query: ListProductsQuery) {
    return this.products.list(query);
  }

  @Get(":slug")
  @ApiOperation({ summary: "Get a published product by its locale-specific slug" })
  @ApiZodParam(slugParamSchema)
  @ApiZodQuery(localeQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(productResponseSchema) })
  @ApiErrorResponses(400, 404)
  async getBySlug(
    @Param(new ZodValidationPipe(slugParamSchema)) params: SlugParam,
    @Query(new ZodValidationPipe(localeQuerySchema)) query: LocaleQuery,
  ) {
    return this.products.getBySlug(params.slug, query.locale);
  }
}
