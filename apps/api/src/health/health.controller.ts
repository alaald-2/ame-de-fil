import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator.js";
import { HealthService } from "./health.service.js";

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
  @ApiResponse({ status: 200, description: "Service is healthy" })
  @ApiResponse({ status: 503, description: "A dependency (e.g. the database) is unreachable" })
  async check() {
    const result = await this.health.check();
    if (result.status === "degraded") {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
