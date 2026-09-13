import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Express } from "express";
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator.ts";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodParam, toOpenApiSchema } from "../common/zod-openapi.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { AdminHeroSlidesService } from "./admin-hero-slides.service.ts";
import { heroSlideIdParamSchema, type HeroSlideIdParam } from "./dto/hero-slide-id.param.ts";
import { heroSlideCtaSchema, updateHeroSlideSchema, type UpdateHeroSlideInput } from "./dto/hero-slide-cta.dto.ts";
import { reorderHeroSlidesSchema, type ReorderHeroSlidesInput } from "./dto/reorder-hero-slides.dto.ts";
import {
  adminHeroSlideResponseSchema,
  listAdminHeroSlidesResponseSchema,
  reorderHeroSlidesResponseSchema,
} from "./dto/responses.ts";

// Two permissions gate this — marketing.view (list) / marketing.manage
// (upload/update/reorder/delete) — the same view/manage split every other
// admin content domain uses (categories.view/.manage,
// collections.view/.manage).
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/hero-slides")
export class AdminHeroSlidesController {
  constructor(private readonly adminHeroSlides: AdminHeroSlidesService) {}

  @Get()
  @RequirePermissions("marketing.view")
  @ApiOperation({ summary: "List every homepage hero slide (active or not), in display order" })
  @ApiOkResponse({ schema: toOpenApiSchema(listAdminHeroSlidesResponseSchema) })
  @ApiErrorResponses(401, 403)
  async list() {
    return this.adminHeroSlides.list();
  }

  @Post()
  @RequirePermissions("marketing.manage")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiOperation({ summary: "Upload a new homepage hero slide (JPEG/PNG/WebP, 5MB max)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: { type: "string", format: "binary" },
        ctaLabelSv: { type: "string" },
        ctaLabelEn: { type: "string" },
        ctaHref: { type: "string" },
      },
    },
  })
  @ApiCreatedResponse({ schema: toOpenApiSchema(adminHeroSlideResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(heroSlideCtaSchema)) body: UpdateHeroSlideInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    if (!file) {
      throw new BadRequestException({ error: "MissingFile", message: "An image file is required" });
    }
    return this.adminHeroSlides.upload(
      { buffer: file.buffer, mimetype: file.mimetype },
      body,
      auth.userId,
      request.ip,
    );
  }

  // Registered before ":id" — Nest/Express match routes in registration
  // order, same route-ordering hazard reorder-product-images.dto.ts's own
  // controller guards against (otherwise ":id" would swallow "order" as a
  // literal slide id).
  @Patch("order")
  @RequirePermissions("marketing.manage")
  @ApiOperation({ summary: "Reorder hero slides (the full, ordered list of slide ids)" })
  @ApiBody({ schema: toOpenApiSchema(reorderHeroSlidesSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(reorderHeroSlidesResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async reorder(
    @Body(new ZodValidationPipe(reorderHeroSlidesSchema)) body: ReorderHeroSlidesInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.adminHeroSlides.reorder(body.slideIds, auth.userId, request.ip);
  }

  @Patch(":id")
  @RequirePermissions("marketing.manage")
  @ApiOperation({ summary: "Update a hero slide's CTA fields and/or active state" })
  @ApiZodParam(heroSlideIdParamSchema)
  @ApiBody({ schema: toOpenApiSchema(updateHeroSlideSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(adminHeroSlideResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404)
  async update(
    @Param(new ZodValidationPipe(heroSlideIdParamSchema)) params: HeroSlideIdParam,
    @Body(new ZodValidationPipe(updateHeroSlideSchema)) body: UpdateHeroSlideInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.adminHeroSlides.update(params.id, body, auth.userId, request.ip);
  }

  @Delete(":id")
  @RequirePermissions("marketing.manage")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a hero slide" })
  @ApiZodParam(heroSlideIdParamSchema)
  @ApiNoContentResponse()
  @ApiErrorResponses(401, 403, 404)
  async delete(
    @Param(new ZodValidationPipe(heroSlideIdParamSchema)) params: HeroSlideIdParam,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    await this.adminHeroSlides.delete(params.id, auth.userId, request.ip);
  }
}
