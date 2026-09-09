import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UsePipes,
} from "@nestjs/common";
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
import { paginationQuerySchema, type PaginationQuery } from "../common/dto/pagination.schema.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { InventoryService } from "./inventory.service.ts";
import { adjustStockSchema, type AdjustStockInput } from "./dto/adjust-stock.dto.ts";
import { variantIdParamSchema, type VariantIdParam } from "./dto/variant-id.param.ts";
import {
  inventoryDetailResponseSchema,
  inventoryItemResponseSchema,
  listInventoryResponseSchema,
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
  @ApiZodQuery(paginationQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listInventoryResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  @UsePipes(new ZodValidationPipe(paginationQuerySchema))
  async list(@Query() query: PaginationQuery) {
    return this.inventory.list(query.page, query.pageSize);
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
  ) {
    return this.inventory.adjustStock(params.variantId, body, auth.userId);
  }
}
