import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator.ts";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodParam, ApiZodQuery, toOpenApiSchema } from "../common/zod-openapi.ts";
import { paginationQuerySchema, type PaginationQuery } from "../common/dto/pagination.schema.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { AdminOrdersService } from "./admin-orders.service.ts";
import { orderIdParamSchema, type OrderIdParam } from "./dto/order-id.param.ts";
import { markShippedSchema, type MarkShippedInput } from "./dto/mark-shipped.dto.ts";
import { fulfillmentResponseSchema } from "./dto/fulfillment-response.ts";
import {
  adminOrderDetailResponseSchema,
  listAdminOrdersResponseSchema,
} from "./dto/admin-order-responses.ts";

// No @Public()/@OptionalAuth() — admin-only, default-deny, same posture as
// InventoryController/AdminProductsController. Two permissions gate this
// controller: "orders.view" (read-only list/detail) and "orders.fulfill"
// (state-changing) — kept separate so a role can be granted one without
// the other, mirroring the existing inventory.view/inventory.adjust split
// rather than overloading orders.fulfill for a different privilege level.
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/orders")
export class AdminOrdersController {
  constructor(private readonly adminOrders: AdminOrdersService) {}

  @Get()
  @RequirePermissions("orders.view")
  @ApiOperation({ summary: "List orders, most recent first" })
  @ApiZodQuery(paginationQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listAdminOrdersResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async list(@Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery) {
    return this.adminOrders.listOrders(query.page, query.pageSize);
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
}
