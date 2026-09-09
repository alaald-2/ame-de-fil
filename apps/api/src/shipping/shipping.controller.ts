import { Controller, Get, Inject, Query, UsePipes } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiZodQuery, toOpenApiSchema } from "../common/zod-openapi.ts";
import { localeQuerySchema, type LocaleQuery } from "../common/dto/locale-query.schema.ts";
import { SHIPPING_PROVIDER, type ShippingProvider } from "./shipping-provider.ts";
import { listShippingMethodsResponseSchema } from "./dto/responses.ts";

// Read-only, public — a visitor must be able to see shipping options and
// prices while browsing checkout before authenticating (guest checkout).
@ApiTags("shipping")
@Controller("shipping-methods")
@Public()
export class ShippingController {
  constructor(@Inject(SHIPPING_PROVIDER) private readonly shipping: ShippingProvider) {}

  @Get()
  @ApiOperation({ summary: "List active shipping methods with their flat-rate price" })
  @ApiZodQuery(localeQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listShippingMethodsResponseSchema) })
  @UsePipes(new ZodValidationPipe(localeQuerySchema))
  async list(@Query() query: LocaleQuery) {
    const quotes = await this.shipping.listAvailableMethods();
    return quotes.map((quote) => ({
      id: quote.shippingMethodId,
      code: quote.code,
      name: query.locale === "sv-SE" ? quote.nameSv : quote.nameEn,
      price: { amountMinor: quote.priceMinor, currency: quote.currency },
      minDeliveryDays: quote.minDeliveryDays,
      maxDeliveryDays: quote.maxDeliveryDays,
    }));
  }
}
