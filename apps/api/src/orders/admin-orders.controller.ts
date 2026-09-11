import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator.ts";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodParam, ApiZodQuery, toOpenApiSchema } from "../common/zod-openapi.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { AdminOrdersService } from "./admin-orders.service.ts";
import { listAdminOrdersQuerySchema, type ListAdminOrdersQuery } from "./dto/list-orders-query.dto.ts";
import { exportOrdersQuerySchema, type ExportOrdersQuery } from "./dto/export-orders-query.dto.ts";
import { orderIdParamSchema, type OrderIdParam } from "./dto/order-id.param.ts";
import { markShippedSchema, type MarkShippedInput } from "./dto/mark-shipped.dto.ts";
import { fulfillmentResponseSchema } from "./dto/fulfillment-response.ts";
import { refundOrderSchema, type RefundOrderInput } from "./dto/refund-order.dto.ts";
import {
  adminOrderDetailResponseSchema,
  listAdminOrdersResponseSchema,
  refundOrderResponseSchema,
} from "./dto/admin-order-responses.ts";

const IDEMPOTENCY_KEY_HEADER = "idempotency-key";

// No @Public()/@OptionalAuth() — admin-only, default-deny, same posture as
// InventoryController/AdminProductsController. Three permissions gate this
// controller: "orders.view" (read-only list/detail), "orders.fulfill"
// (fulfillment state-changing), and "orders.refund" (money movement) —
// kept separate so a role can be granted one without the others, mirroring
// the existing inventory.view/inventory.adjust split rather than
// overloading orders.fulfill for a different privilege level.
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/orders")
export class AdminOrdersController {
  constructor(private readonly adminOrders: AdminOrdersService) {}

  @Get()
  @RequirePermissions("orders.view")
  @ApiOperation({
    summary:
      "List orders, most recent first — optionally filtered to those with a matching payment/refund status",
  })
  @ApiZodQuery(listAdminOrdersQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listAdminOrdersResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async list(@Query(new ZodValidationPipe(listAdminOrdersQuerySchema)) query: ListAdminOrdersQuery) {
    return this.adminOrders.listOrders(query.page, query.pageSize, query.paymentStatus, query.refundStatus);
  }

  // Registered before ":orderId" — Nest matches routes in registration
  // order, and "export" would otherwise be swallowed by the ":orderId"
  // param route below.
  @Get("export")
  @RequirePermissions("orders.view")
  @ApiOperation({ summary: "Download a CSV of confirmed orders in a date range, for accounting" })
  @ApiZodQuery(exportOrdersQuerySchema)
  @ApiErrorResponses(400, 401, 403)
  async export(
    @Query(new ZodValidationPipe(exportOrdersQuerySchema)) query: ExportOrdersQuery,
    @Res() response: Response,
  ) {
    const csv = await this.adminOrders.exportOrdersCsv(new Date(query.from), new Date(query.to));
    const filename = `orders-${query.from.slice(0, 10)}-${query.to.slice(0, 10)}.csv`;
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    response.send(csv);
  }

  @Get(":orderId")
  @RequirePermissions("orders.view")
  @ApiOperation({ summary: "Get full order detail — items, payments, shipments, addresses" })
  @ApiZodParam(orderIdParamSchema)
  @ApiOkResponse({ schema: toOpenApiSchema(adminOrderDetailResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404)
  async getOne(@Param(new ZodValidationPipe(orderIdParamSchema)) params: OrderIdParam) {
    return this.adminOrders.getOrderDetail(params.orderId);
  }

  @Post(":orderId/ready-to-ship")
  @RequirePermissions("orders.fulfill")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark a CONFIRMED order as ready to ship" })
  @ApiZodParam(orderIdParamSchema)
  @ApiOkResponse({ schema: toOpenApiSchema(fulfillmentResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async readyToShip(
    @Param(new ZodValidationPipe(orderIdParamSchema)) params: OrderIdParam,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.adminOrders.markReadyToShip(params.orderId, auth.userId, request.ip);
  }

  @Post(":orderId/ship")
  @RequirePermissions("orders.fulfill")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark a READY_TO_SHIP order as shipped, recording carrier/tracking" })
  @ApiZodParam(orderIdParamSchema)
  @ApiBody({ schema: toOpenApiSchema(markShippedSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(fulfillmentResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async ship(
    @Param(new ZodValidationPipe(orderIdParamSchema)) params: OrderIdParam,
    @Body(new ZodValidationPipe(markShippedSchema)) body: MarkShippedInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.adminOrders.markShipped(params.orderId, body, auth.userId, request.ip);
  }

  @Post(":orderId/deliver")
  @RequirePermissions("orders.fulfill")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark a SHIPPED order as delivered" })
  @ApiZodParam(orderIdParamSchema)
  @ApiOkResponse({ schema: toOpenApiSchema(fulfillmentResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async deliver(
    @Param(new ZodValidationPipe(orderIdParamSchema)) params: OrderIdParam,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.adminOrders.markDelivered(params.orderId, auth.userId, request.ip);
  }

  // Idempotency-Key required, same posture/header as checkout's own
  // POST /checkout (checkout.controller.ts) — this is a money-movement
  // mutation with a real payment-provider call behind it, exactly the kind
  // of request an admin's retry-after-timeout must not be allowed to
  // double-submit.
  @Post(":orderId/refund")
  @RequirePermissions("orders.refund")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Issue an amount-based refund against an order's payment" })
  @ApiZodParam(orderIdParamSchema)
  @ApiHeader({ name: IDEMPOTENCY_KEY_HEADER, required: true })
  @ApiBody({ schema: toOpenApiSchema(refundOrderSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(refundOrderResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404, 409, 422)
  async refund(
    @Param(new ZodValidationPipe(orderIdParamSchema)) params: OrderIdParam,
    @Body(new ZodValidationPipe(refundOrderSchema)) body: RefundOrderInput,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException({
        error: "IdempotencyKeyRequired",
        message: `The "${IDEMPOTENCY_KEY_HEADER}" header is required`,
      });
    }

    return this.adminOrders.issueRefund(params.orderId, body, idempotencyKey, auth.userId, request.ip);
  }
}
