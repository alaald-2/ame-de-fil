import { Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ReservationExpiryService } from "./reservation-expiry.service.ts";

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
  @ApiErrorResponses(401, 403)
  async expireReservations() {
    return this.reservationExpiry.releaseExpiredReservations();
  }
}
