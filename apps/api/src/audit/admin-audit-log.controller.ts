import { Controller, Get, Query } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodQuery, toOpenApiSchema } from "../common/zod-openapi.ts";
import { paginationQuerySchema, type PaginationQuery } from "../common/dto/pagination.schema.ts";
import { AdminAuditLogService } from "./admin-audit-log.service.ts";
import { listAdminAuditLogResponseSchema } from "./dto/admin-audit-log-responses.ts";

// No @Public()/@OptionalAuth() — admin-only, default-deny, same posture as
// every other admin controller. `audit.view` is its own permission, not
// folded into any existing one — the audit trail reveals other admins'
// actions and IPs, a distinct, more sensitive privilege than viewing
// orders/inventory (SECURITY.md §9).
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/audit-log")
export class AdminAuditLogController {
  constructor(private readonly adminAuditLog: AdminAuditLogService) {}

  @Get()
  @RequirePermissions("audit.view")
  @ApiOperation({ summary: "List audit log entries, most recent first" })
  @ApiZodQuery(paginationQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listAdminAuditLogResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async list(@Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery) {
    return this.adminAuditLog.list(query.page, query.pageSize);
  }
}
