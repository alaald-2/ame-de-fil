import { randomUUID } from "node:crypto";
import { Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator.ts";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { AuditService } from "../audit/audit.service.ts";
import { ReservationExpiryService } from "./reservation-expiry.service.ts";
import { toOpenApiSchema } from "../common/zod-openapi.ts";
import { expireReservationsResponseSchema } from "./dto/responses.ts";

// ReservationExpiryScheduler (reservation-expiry.scheduler.ts) already
// sweeps automatically — this endpoint is the manual/ops-triggered
// complement, useful for an immediate on-demand run without waiting for
// the next scheduled tick. Admin-only, default-deny like every other
// controller; the logic itself is idempotent, so calling it from both
// paths (or repeatedly, or concurrently) is always safe.
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/checkout")
export class AdminCheckoutController {
  constructor(
    private readonly reservationExpiry: ReservationExpiryService,
    private readonly audit: AuditService,
  ) {}

  // The AuditService call lives here, not inside ReservationExpiryService,
  // because that service is deliberately actor-agnostic — it's also called
  // every tick by ReservationExpiryScheduler with no human actor at all
  // (reservation-expiry.scheduler.ts). Only a manually-triggered run via
  // this admin endpoint has an actor worth recording; the automatic sweep
  // stays unaudited system automation, not an admin action.
  @Post("expire-reservations")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("checkout.manage")
  @ApiOperation({
    summary: "Release expired stock reservations and cancel their orders (idempotent)",
  })
  @ApiOkResponse({ schema: toOpenApiSchema(expireReservationsResponseSchema) })
  @ApiErrorResponses(401, 403)
  async expireReservations(@CurrentUser() auth: AuthContext, @Req() request: Request) {
    const result = await this.reservationExpiry.releaseExpiredReservations();

    await this.audit.record({
      actorUserId: auth.userId,
      action: "checkout.reservations_expired",
      entityType: "ReservationExpirySweep",
      entityId: randomUUID(),
      after: {
        releasedReservations: result.releasedReservations,
        canceledOrders: result.canceledOrders,
      },
      ipAddress: request.ip,
    });

    return result;
  }
}
