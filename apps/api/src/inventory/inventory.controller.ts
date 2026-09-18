import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UsePipes,
} from "@nestjs/common";
import type { Request } from "express";
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.ts";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodParam, ApiZodQuery, toOpenApiSchema } from "../common/zod-openapi.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { InventoryService } from "./inventory.service.ts";
import { adjustStockSchema, type AdjustStockInput } from "./dto/adjust-stock.dto.ts";
import { variantIdParamSchema, type VariantIdParam } from "./dto/variant-id.param.ts";
import {
  listInventoryQuerySchema,
  type ListInventoryQuery,
} from "./dto/list-inventory-query.dto.ts";
import {
  listReservationsQuerySchema,
  type ListReservationsQuery,
} from "./dto/list-reservations.dto.ts";
import { listMovementsQuerySchema, type ListMovementsQuery } from "./dto/list-movements.dto.ts";
import {
  inventoryDetailResponseSchema,
  inventoryItemResponseSchema,
  listInventoryResponseSchema,
  listMovementsResponseSchema,
  listReservationsResponseSchema,
} from "./dto/responses.ts";

// No @Public()/@OptionalAuth() — admin-only, default-deny like every other
// controller. Both routes require a real permission (SECURITY.md §2); the
// storefront/catalog never reaches this controller at all.
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @RequirePermissions("inventory.view")
  @ApiOperation({ summary: "List inventory items with stock/availability" })
  @ApiZodQuery(listInventoryQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listInventoryResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  @UsePipes(new ZodValidationPipe(listInventoryQuerySchema))
  async list(@Query() query: ListInventoryQuery) {
    return this.inventory.list(query.page, query.pageSize, query.q);
  }

  // Must be declared before @Get(":variantId") below — Nest/Express match
  // routes in registration order, and ":variantId" would otherwise swallow
  // "low-stock" as a literal variant id.
  @Get("low-stock")
  @RequirePermissions("inventory.view")
  @ApiOperation({
    summary: "List finite-stock items where onHand - reserved is below their lowStockThreshold",
  })
  @ApiZodQuery(listInventoryQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listInventoryResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  @UsePipes(new ZodValidationPipe(listInventoryQuerySchema))
  async listLowStock(@Query() query: ListInventoryQuery) {
    return this.inventory.listLowStock(query.page, query.pageSize, query.q);
  }

  // Same route-ordering requirement as "low-stock" above — must be
  // declared before @Get(":variantId").
  @Get("reservations")
  @RequirePermissions("inventory.view")
  @ApiOperation({
    summary: "List stock reservations, soonest-to-expire first (PENDING by default)",
  })
  @ApiZodQuery(listReservationsQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listReservationsResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async listReservations(
    @Query(new ZodValidationPipe(listReservationsQuerySchema)) query: ListReservationsQuery,
  ) {
    return this.inventory.listReservations(query);
  }

  // Same route-ordering requirement as "low-stock"/"reservations" above.
  @Get("movements")
  @RequirePermissions("inventory.view")
  @ApiOperation({ summary: "Cross-item inventory movement ledger, most recent first" })
  @ApiZodQuery(listMovementsQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listMovementsResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async listMovements(
    @Query(new ZodValidationPipe(listMovementsQuerySchema)) query: ListMovementsQuery,
  ) {
    return this.inventory.listMovements(query);
  }

  @Get(":variantId")
  @RequirePermissions("inventory.view")
  @ApiOperation({ summary: "Get one variant's inventory item with recent movement history" })
  @ApiZodParam(variantIdParamSchema)
  @ApiOkResponse({ schema: toOpenApiSchema(inventoryDetailResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404)
  async getOne(@Param(new ZodValidationPipe(variantIdParamSchema)) params: VariantIdParam) {
    return this.inventory.getByVariantId(params.variantId);
  }

  @Post(":variantId/adjustments")
  @RequirePermissions("inventory.adjust")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Adjust onHand stock for a variant, recorded as an InventoryMovement" })
  @ApiZodParam(variantIdParamSchema)
  @ApiBody({ schema: toOpenApiSchema(adjustStockSchema) })
  @ApiCreatedResponse({ schema: toOpenApiSchema(inventoryItemResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404)
  async adjust(
    @Param(new ZodValidationPipe(variantIdParamSchema)) params: VariantIdParam,
    @Body(new ZodValidationPipe(adjustStockSchema)) body: AdjustStockInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.inventory.adjustStock(params.variantId, body, auth.userId, request.ip);
  }
}
