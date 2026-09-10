import { Body, Controller, HttpCode, HttpStatus, Param, Post, Req } from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator.ts";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodParam, toOpenApiSchema } from "../common/zod-openapi.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { AdminOrdersService } from "./admin-orders.service.ts";
import { orderIdParamSchema, type OrderIdParam } from "./dto/order-id.param.ts";
import { markShippedSchema, type MarkShippedInput } from "./dto/mark-shipped.dto.ts";
import { fulfillmentResponseSchema } from "./dto/fulfillment-response.ts";

// No @Public()/@OptionalAuth() — admin-only, default-deny, same posture as
// InventoryController/AdminProductsController. The "orders.fulfill"
// permission is the authoritative boundary.
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/orders")
export class AdminOrdersController {
  constructor(private readonly adminOrders: AdminOrdersService) {}

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
