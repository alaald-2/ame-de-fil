import { Controller, Get } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { toOpenApiSchema } from "../common/zod-openapi.ts";
import { AdminUsersService } from "./admin-users.service.ts";
import { listAdminRolesResponseSchema } from "./dto/admin-user-responses.ts";

// Read-only role+permission catalog — exists only so a caller assigning a
// role (POST /admin/users/:id/roles) knows what's assignable. Not Role
// CRUD: creating a role or editing a role's own permission set stays
// seed-script-only in v1 (approved scope) — gated by `users.manage_roles`
// since listing roles is only useful in service of assigning them, not a
// separate concern worth its own permission.
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/roles")
export class AdminRolesController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  @RequirePermissions("users.manage_roles")
  @ApiOperation({ summary: "List every role and the permissions it grants" })
  @ApiOkResponse({ schema: toOpenApiSchema(listAdminRolesResponseSchema) })
  @ApiErrorResponses(401, 403)
  async list() {
    return this.adminUsers.listRoles();
  }
}
