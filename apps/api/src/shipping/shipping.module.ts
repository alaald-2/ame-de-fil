import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { PrismaService } from "../database/prisma.service.ts";
import { ShippingController } from "./shipping.controller.ts";
import { SHIPPING_PROVIDER, ManualShippingProvider, type ShippingProvider } from "./shipping-provider.ts";
import { ShipmondoShippingProvider } from "./shipmondo-shipping.provider.ts";

// ShippingProvider abstraction (DECISIONS.md ADR-022/ADR-037).
// SHIPPING_PROVIDER resolves to ShipmondoShippingProvider when all six
// SHIPMONDO_* env vars are configured, ManualShippingProvider (flat
// admin-entered fee, no external call) otherwise — the same "disclosed
// rather than faked" posture as PAYMENT_PROVIDER/GOOGLE_OAUTH_PROVIDER, so
// local dev without Shipmondo credentials still boots and checkout still
// works end-to-end, just without live carrier rates.
//
// ShipmondoShippingProvider is deliberately *not* registered as its own
// standalone provider — Nest would eagerly construct it (and its
// config-validating constructor would throw) on every boot, including when
// Shipmondo isn't configured at all, defeating the fallback below entirely
// (same reasoning as PaymentsModule's own comment).
@Module({
  controllers: [ShippingController],
  providers: [
    {
      provide: SHIPPING_PROVIDER,
      useFactory: (
        config: ConfigService<Env, true>,
        prisma: PrismaService,
        manual: ManualShippingProvider,
      ): ShippingProvider => {
        const shipmondoConfigured =
          Boolean(config.get("SHIPMONDO_API_USER", { infer: true })) &&
          Boolean(config.get("SHIPMONDO_API_KEY", { infer: true })) &&
          Boolean(config.get("SHIPMONDO_BASE_URL", { infer: true })) &&
          Boolean(config.get("SHIPMONDO_SENDER_ADDRESS1", { infer: true })) &&
          Boolean(config.get("SHIPMONDO_SENDER_ZIPCODE", { infer: true })) &&
          Boolean(config.get("SHIPMONDO_SENDER_CITY", { infer: true }));
        return shipmondoConfigured ? new ShipmondoShippingProvider(config, prisma) : manual;
      },
      inject: [ConfigService, PrismaService, ManualShippingProvider],
    },
    ManualShippingProvider,
  ],
  exports: [SHIPPING_PROVIDER],
})
export class ShippingModule {}
