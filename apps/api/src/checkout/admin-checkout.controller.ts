import { Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { ReservationExpiryService } from "./reservation-expiry.service.ts";

// No queue/scheduler is provisioned in this environment (see
// reservation-expiry.service.ts) — this is the concrete trigger point a
// real cron job or ops runbook calls periodically until one is. Admin-only,
// default-deny like every other controller; the logic itself is idempotent
// so calling it on any schedule, or manually, is always safe.
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/checkout")
export class AdminCheckoutController {
  constructor(private readonly reservationExpiry: ReservationExpiryService) {}

  @Post("expire-reservations")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("checkout.manage")
  @ApiOperation({
    summary: "Release expired stock reservations and cancel their orders (idempotent)",
  })
  @ApiOkResponse({
    schema: {
      type: "object",
      properties: {
        releasedReservations: { type: "integer" },
        canceledOrders: { type: "integer" },
      },
    },
  })
  async expireReservations() {
    return this.reservationExpiry.releaseExpiredReservations();
  }
}
