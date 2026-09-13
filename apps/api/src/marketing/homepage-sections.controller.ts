import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator.ts";
import { toOpenApiSchema } from "../common/zod-openapi.ts";
import { HomepageSectionsService } from "./homepage-sections.service.ts";
import { listHomepageSectionsResponseSchema } from "./dto/responses.ts";

// Read-only, public (@Public()) — same posture as hero-slides.controller.ts.
// No locale query: these are images only, nothing to resolve per-locale.
@ApiTags("marketing")
@Controller("homepage-sections")
@Public()
export class HomepageSectionsController {
  constructor(private readonly homepageSections: HomepageSectionsService) {}

  @Get()
  @ApiOperation({ summary: "Get the homepage's two named image slots (story, made-to-order)" })
  @ApiOkResponse({ schema: toOpenApiSchema(listHomepageSectionsResponseSchema) })
  async list() {
    return this.homepageSections.list();
  }
}
