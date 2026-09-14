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
import { AdminHomepageSectionsService } from "./admin-homepage-sections.service.ts";
import {
  homepageSectionKeyParamSchema,
  type HomepageSectionKeyParam,
} from "./dto/homepage-section-key.param.ts";
import {
  homepageSectionContentSchema,
  type HomepageSectionContentInput,
} from "./dto/homepage-section-content.dto.ts";
import {
  listAdminHomepageSectionsResponseSchema,
  adminHomepageSectionResponseSchema,
} from "./dto/responses.ts";

// Same marketing.view/marketing.manage split as admin-hero-slides.controller.ts
// — these are the homepage's other admin-manageable images, same domain.
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/homepage-sections")
export class AdminHomepageSectionsController {
  constructor(private readonly adminHomepageSections: AdminHomepageSectionsService) {}

  @Get()
  @RequirePermissions("marketing.view")
  @ApiOperation({ summary: "Get the site's four named content sections (hero, story, made-to-order, announcement)" })
  @ApiOkResponse({ schema: toOpenApiSchema(listAdminHomepageSectionsResponseSchema) })
  @ApiErrorResponses(401, 403)
  async list() {
    return this.adminHomepageSections.list();
  }

  @Post(":key/image")
  @RequirePermissions("marketing.manage")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiOperation({ summary: "Upload (or replace) a homepage section's image (JPEG/PNG/WebP, 5MB max)" })
  @ApiZodParam(homepageSectionKeyParamSchema)
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" } } },
  })
  @ApiCreatedResponse({ schema: toOpenApiSchema(adminHomepageSectionResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async uploadImage(
    @Param(new ZodValidationPipe(homepageSectionKeyParamSchema)) params: HomepageSectionKeyParam,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    if (!file) {
      throw new BadRequestException({ error: "MissingFile", message: "An image file is required" });
    }
    return this.adminHomepageSections.uploadImage(
      params.key,
      { buffer: file.buffer, mimetype: file.mimetype },
      auth.userId,
      request.ip,
    );
  }

  @Delete(":key/image")
  @RequirePermissions("marketing.manage")
  @ApiOperation({ summary: "Remove a homepage section's image (reverts to the storefront's placeholder)" })
  @ApiZodParam(homepageSectionKeyParamSchema)
  @ApiOkResponse({ schema: toOpenApiSchema(adminHomepageSectionResponseSchema) })
  @ApiErrorResponses(401, 403)
  async deleteImage(
    @Param(new ZodValidationPipe(homepageSectionKeyParamSchema)) params: HomepageSectionKeyParam,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.adminHomepageSections.deleteImage(params.key, auth.userId, request.ip);
  }

  @Patch(":key")
  @RequirePermissions("marketing.manage")
  @ApiOperation({ summary: "Update a homepage section's text content (eyebrow/title/description/CTA)" })
  @ApiZodParam(homepageSectionKeyParamSchema)
  @ApiBody({ schema: toOpenApiSchema(homepageSectionContentSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(adminHomepageSectionResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async updateContent(
    @Param(new ZodValidationPipe(homepageSectionKeyParamSchema)) params: HomepageSectionKeyParam,
    @Body(new ZodValidationPipe(homepageSectionContentSchema)) body: HomepageSectionContentInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.adminHomepageSections.updateContent(params.key, body, auth.userId, request.ip);
  }
}
