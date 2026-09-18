import { Controller, Get, Query } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodQuery, toOpenApiSchema } from "../common/zod-openapi.ts";
import { DashboardService } from "./dashboard.service.ts";
import { dashboardQuerySchema, type DashboardQuery } from "./dto/dashboard-query.dto.ts";
import { dashboardOverviewResponseSchema } from "./dto/dashboard-response.ts";

// No @Public()/@OptionalAuth() — admin-only, default-deny, same posture as
// every other admin controller. Gated by its own `dashboard.view`
// permission (SECURITY.md §2) rather than any underlying domain's `*.view`
// permission — this endpoint exposes cross-domain aggregates (revenue,
// refund totals) that no existing permission's scope actually covers.
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequirePermissions("dashboard.view")
  @ApiOperation({
    summary: "Admin dashboard overview — revenue, orders, payments, refunds, customers, alerts",
  })
  @ApiZodQuery(dashboardQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(dashboardOverviewResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async getOverview(@Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQuery) {
    return this.dashboard.getOverview(query.from, query.to);
  }
}
