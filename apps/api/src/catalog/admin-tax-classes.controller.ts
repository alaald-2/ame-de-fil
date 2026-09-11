import { Controller, Get } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { toOpenApiSchema } from "../common/zod-openapi.ts";
import { AdminProductsService } from "./admin-products.service.ts";
import { listAdminTaxClassesResponseSchema } from "./dto/responses.ts";

// Read-only reference catalog — exists only so a caller creating/editing a
// product variant knows what's a valid taxClassCode, same rationale as
// AdminRolesController (users/admin-roles.controller.ts: "exists only so a
// caller assigning a role knows what's assignable"). Gated by the existing
// products.view permission, not a new one — listing tax classes is only
// useful in service of viewing/editing products, not a separate concern.
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/tax-classes")
export class AdminTaxClassesController {
  constructor(private readonly adminProducts: AdminProductsService) {}

  @Get()
  @RequirePermissions("products.view")
  @ApiOperation({ summary: "List every tax class (id, code, name)" })
  @ApiOkResponse({ schema: toOpenApiSchema(listAdminTaxClassesResponseSchema) })
  @ApiErrorResponses(401, 403)
  async list() {
    return this.adminProducts.listTaxClasses();
  }
}
