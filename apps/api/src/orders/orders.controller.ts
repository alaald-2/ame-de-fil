import { Controller, Get, Headers, Param } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { OptionalAuth } from "../common/decorators/optional-auth.decorator.ts";
import { CurrentUser } from "../common/decorators/current-user.decorator.ts";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodParam, toOpenApiSchema } from "../common/zod-openapi.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { OrdersService } from "./orders.service.ts";
import { orderIdParamSchema, type OrderIdParam } from "./dto/order-id.param.ts";
import { orderStatusResponseSchema } from "./dto/order-status-response.ts";

const ORDER_STATUS_TOKEN_HEADER = "x-order-status-token";

// @OptionalAuth() — this endpoint serves both a logged-in customer polling
// their own order (authorized by session ownership) and a guest polling
// theirs (authorized by X-Order-Status-Token — never a query parameter,
// to keep it out of server/proxy access logs). See orders.service.ts for
// the authorization logic itself.
@ApiTags("orders")
@ApiCookieAuth("ame_session")
@Controller("orders")
@OptionalAuth()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get(":orderId/status")
  // Public, guest-reachable, and meant to be polled — a light per-IP limit
  // is hygiene against abuse/scraping, not a meaningful brute-force defense
  // against the token itself (256 bits of entropy already handles that).
  @RateLimit({ windowMs: 1000, max: 5 })
  @ApiOperation({
    summary:
      "Minimal order/payment status for storefront polling (never the browser redirect) — " +
      "no addresses, line items, or amounts",
  })
  @ApiZodParam(orderIdParamSchema)
  @ApiHeader({
    name: ORDER_STATUS_TOKEN_HEADER,
    required: false,
    description: "Required for a guest (unauthenticated) caller; ignored for an authenticated one",
  })
  @ApiOkResponse({ schema: toOpenApiSchema(orderStatusResponseSchema) })
  @ApiErrorResponses(400, 401, 404, 429)
  async getStatus(
    @Param(new ZodValidationPipe(orderIdParamSchema)) params: OrderIdParam,
    @CurrentUser() auth: AuthContext | undefined,
    @Headers(ORDER_STATUS_TOKEN_HEADER) guestToken: string | undefined,
  ) {
    return this.orders.getStatus(params.orderId, guestToken, auth);
  }
}
