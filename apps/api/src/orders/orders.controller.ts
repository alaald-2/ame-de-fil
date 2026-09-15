import { Controller, Get, Headers, Param, Query } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { OptionalAuth } from "../common/decorators/optional-auth.decorator.ts";
import { CurrentUser } from "../common/decorators/current-user.decorator.ts";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodParam, ApiZodQuery, toOpenApiSchema } from "../common/zod-openapi.ts";
import { paginationQuerySchema, type PaginationQuery } from "../common/dto/pagination.schema.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { OrdersService } from "./orders.service.ts";
import { orderIdParamSchema, type OrderIdParam } from "./dto/order-id.param.ts";
import { orderStatusResponseSchema } from "./dto/order-status-response.ts";
import { listMyOrdersResponseSchema, myOrderDetailResponseSchema } from "./dto/my-order-responses.ts";

const ORDER_STATUS_TOKEN_HEADER = "x-order-status-token";

// No class-level @OptionalAuth() (moved onto getStatus() alone, below) —
// the two "my orders" routes need a real session (SessionAuthGuard's
// default-deny posture, SECURITY.md §2): an authenticated customer sees
// only her own orders, scoped by AuthContext.userId, never gated by a
// permission (unlike AdminOrdersController — this is "my own data," not an
// admin privilege).
@ApiTags("orders")
@ApiCookieAuth("ame_session")
@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: "List the caller's own orders, most recent first" })
  @ApiZodQuery(paginationQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listMyOrdersResponseSchema) })
  @ApiErrorResponses(400, 401)
  async listMine(
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
    @CurrentUser() auth: AuthContext,
  ) {
    return this.orders.listMyOrders(auth.userId, query.page, query.pageSize);
  }

  @Get(":orderId")
  @ApiOperation({ summary: "Full detail for one of the caller's own orders" })
  @ApiZodParam(orderIdParamSchema)
  @ApiOkResponse({ schema: toOpenApiSchema(myOrderDetailResponseSchema) })
  @ApiErrorResponses(400, 401, 404)
  async getMine(
    @Param(new ZodValidationPipe(orderIdParamSchema)) params: OrderIdParam,
    @CurrentUser() auth: AuthContext,
  ) {
    return this.orders.getMyOrderDetail(auth.userId, params.orderId);
  }

  // @OptionalAuth() — this endpoint serves both a logged-in customer polling
  // their own order (authorized by session ownership) and a guest polling
  // theirs (authorized by X-Order-Status-Token — never a query parameter,
  // to keep it out of server/proxy access logs). See orders.service.ts for
  // the authorization logic itself. Registered after listMine/getMine so
  // Nest's route matching never confuses ":orderId" with ":orderId/status"
  // (distinct patterns regardless of order, but kept in reading order with
  // the two routes it's most easily confused with).
  @Get(":orderId/status")
  @OptionalAuth()
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
