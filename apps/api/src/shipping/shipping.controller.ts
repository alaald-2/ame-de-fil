import { Controller, Get, Inject, Param, Query, UsePipes } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodQuery, ApiZodParam, toOpenApiSchema } from "../common/zod-openapi.ts";
import { SHIPPING_PROVIDER, type ShippingProvider } from "./shipping-provider.ts";
import {
  listShippingMethodsResponseSchema,
  listPickupPointsResponseSchema,
} from "./dto/responses.ts";
import {
  listShippingMethodsQuerySchema,
  type ListShippingMethodsQuery,
} from "./dto/list-methods-query.schema.ts";
import {
  shippingMethodIdParamSchema,
  listPickupPointsQuerySchema,
  type ShippingMethodIdParam,
  type ListPickupPointsQuery,
} from "./dto/pickup-points-query.schema.ts";

// Read-only, public — a visitor must be able to see shipping options and
// prices while browsing checkout before authenticating (guest checkout).
@ApiTags("shipping")
@Controller("shipping-methods")
@Public()
export class ShippingController {
  constructor(@Inject(SHIPPING_PROVIDER) private readonly shipping: ShippingProvider) {}

  @Get()
  @ApiOperation({ summary: "List active shipping methods with their flat-rate price" })
  @ApiZodQuery(listShippingMethodsQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listShippingMethodsResponseSchema) })
  @ApiErrorResponses(400)
  @UsePipes(new ZodValidationPipe(listShippingMethodsQuerySchema))
  async list(@Query() query: ListShippingMethodsQuery) {
    const destination =
      query.postalCode && query.country
        ? { postalCode: query.postalCode, country: query.country }
        : undefined;
    const parcel = query.weightGrams !== undefined ? { weightGrams: query.weightGrams } : undefined;
    const quotes = await this.shipping.listAvailableMethods(destination, parcel);
    return quotes.map((quote) => ({
      id: quote.shippingMethodId,
      code: quote.code,
      name: query.locale === "sv-SE" ? quote.nameSv : quote.nameEn,
      price: { amountMinor: quote.priceMinor, currency: quote.currency },
      minDeliveryDays: quote.minDeliveryDays,
      maxDeliveryDays: quote.maxDeliveryDays,
      requiresPickupPoint: quote.requiresPickupPoint,
    }));
  }

  @Get(":shippingMethodId/pickup-points")
  @ApiOperation({ summary: "List pickup points (ombud/paketbox) near a postal code" })
  @ApiZodParam(shippingMethodIdParamSchema)
  @ApiZodQuery(listPickupPointsQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listPickupPointsResponseSchema) })
  @ApiErrorResponses(400)
  async listPickupPoints(
    @Param(new ZodValidationPipe(shippingMethodIdParamSchema)) params: ShippingMethodIdParam,
    @Query(new ZodValidationPipe(listPickupPointsQuerySchema)) query: ListPickupPointsQuery,
  ) {
    return this.shipping.listPickupPoints(params.shippingMethodId, query.postalCode);
  }
}
