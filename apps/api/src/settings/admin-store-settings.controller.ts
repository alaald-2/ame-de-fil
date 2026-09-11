import { Body, Controller, Get, Patch, Req } from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator.ts";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { toOpenApiSchema } from "../common/zod-openapi.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { AdminStoreSettingsService } from "./admin-store-settings.service.ts";
import {
  updateStoreSettingsSchema,
  type UpdateStoreSettingsInput,
} from "./dto/update-store-settings.dto.ts";
import { storeSettingsResponseSchema } from "./dto/store-settings-response.ts";

// The store's own business info (name/address/org number/VAT number) —
// read for the printable order receipt (Orders detail page), edited here.
// Non-sensitive (it's letterhead content, not a secret), but still
// admin-only and permission-gated like every other admin resource. read/
// write are split (settings.view/settings.manage) matching the
// products.view/products.update precedent, not folded into an existing
// permission — this is a genuinely separate concern from any of them.
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/store-settings")
export class AdminStoreSettingsController {
  constructor(private readonly storeSettings: AdminStoreSettingsService) {}

  @Get()
  @RequirePermissions("settings.view")
  @ApiOperation({ summary: "Get the store's business info and receipt display settings" })
  @ApiOkResponse({ schema: toOpenApiSchema(storeSettingsResponseSchema) })
  @ApiErrorResponses(401, 403)
  async get() {
    return this.storeSettings.get();
  }

  @Patch()
  @RequirePermissions("settings.manage")
  @ApiOperation({ summary: "Update the store's business info and receipt display settings" })
  @ApiBody({ schema: toOpenApiSchema(updateStoreSettingsSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(storeSettingsResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async update(
    @Body(new ZodValidationPipe(updateStoreSettingsSchema)) body: UpdateStoreSettingsInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.storeSettings.update(body, auth.userId, request.ip);
  }
}
