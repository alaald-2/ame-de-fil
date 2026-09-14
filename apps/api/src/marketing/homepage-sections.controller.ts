import { Controller, Get, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodQuery, toOpenApiSchema } from "../common/zod-openapi.ts";
import { localeQuerySchema, type LocaleQuery } from "../common/dto/locale-query.schema.ts";
import { HomepageSectionsService } from "./homepage-sections.service.ts";
import { listHomepageSectionsResponseSchema } from "./dto/responses.ts";

// Read-only, public (@Public()) — same posture as hero-slides.controller.ts.
// Takes a locale now (it didn't when this was images-only) since each
// section's text content resolves to one string per the requested locale.
@ApiTags("marketing")
@Controller("homepage-sections")
@Public()
export class HomepageSectionsController {
  constructor(private readonly homepageSections: HomepageSectionsService) {}

  @Get()
  @ApiOperation({ summary: "Get the site's four named content sections (hero, story, made-to-order, announcement)" })
  @ApiZodQuery(localeQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listHomepageSectionsResponseSchema) })
  @ApiErrorResponses(400)
  async list(@Query(new ZodValidationPipe(localeQuerySchema)) query: LocaleQuery) {
    return this.homepageSections.list(query.locale);
  }
}
