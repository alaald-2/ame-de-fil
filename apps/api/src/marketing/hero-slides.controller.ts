import { Controller, Get, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodQuery, toOpenApiSchema } from "../common/zod-openapi.ts";
import { localeQuerySchema, type LocaleQuery } from "../common/dto/locale-query.schema.ts";
import { HeroSlidesService } from "./hero-slides.service.ts";
import { listHeroSlidesResponseSchema } from "./dto/responses.ts";

// Read-only, public (@Public()) — same posture as products.controller.ts.
// Only active slides are ever returned (HeroSlidesService.listActive).
@ApiTags("marketing")
@Controller("hero-slides")
@Public()
export class HeroSlidesController {
  constructor(private readonly heroSlides: HeroSlidesService) {}

  @Get()
  @ApiOperation({ summary: "List active homepage hero slides, in display order" })
  @ApiZodQuery(localeQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listHeroSlidesResponseSchema) })
  @ApiErrorResponses(400)
  async list(@Query(new ZodValidationPipe(localeQuerySchema)) query: LocaleQuery) {
    return this.heroSlides.listActive(query.locale);
  }
}
