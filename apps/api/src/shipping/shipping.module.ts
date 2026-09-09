import { Module } from "@nestjs/common";
import { ShippingController } from "./shipping.controller.ts";
import { SHIPPING_PROVIDER, ManualShippingProvider } from "./shipping-provider.ts";

// ShippingProvider abstraction, ManualShippingProvider (DECISIONS.md
// ADR-022) — a flat admin-entered fee for v1. Carrier integrations
// (PostNord/DHL/Bring), live rates, labels, and carrier webhooks remain
// explicitly out of scope; a real carrier only ever needs to provide a
// different SHIPPING_PROVIDER implementation, never touch its consumers.
@Module({
  controllers: [ShippingController],
  providers: [{ provide: SHIPPING_PROVIDER, useClass: ManualShippingProvider }],
  exports: [SHIPPING_PROVIDER],
})
export class ShippingModule {}
