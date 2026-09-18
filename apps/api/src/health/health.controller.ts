import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { Public } from "../common/decorators/public.decorator.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { toOpenApiSchema } from "../common/zod-openapi.ts";
import { HealthService } from "./health.service.ts";

const healthResponseSchema = z.object({
  status: z.literal("ok"),
  checks: z.object({ database: z.literal("up") }),
  timestamp: z.iso.datetime(),
});

// Unversioned and unauthenticated by design (DEPLOYMENT.md §5) — a load
// balancer/orchestrator probe must not need a session or the /api/v1 prefix.
@ApiTags("health")
@Controller("health")
@Public()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Liveness/readiness probe" })
  @ApiOkResponse({ description: "Service is healthy", schema: toOpenApiSchema(healthResponseSchema) })
  @ApiErrorResponses(503)
  async check() {
    const result = await this.health.check();
    if (result.status === "degraded") {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
