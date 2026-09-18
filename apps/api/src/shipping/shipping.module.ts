import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { PrismaService } from "../database/prisma.service.ts";
import { ShippingController } from "./shipping.controller.ts";
import {
  SHIPPING_PROVIDER,
  ManualShippingProvider,
  type ShippingProvider,
} from "./shipping-provider.ts";
import { ShipmondoShippingProvider } from "./shipmondo-shipping.provider.ts";
import { PostNordShippingProvider } from "./postnord-shipping.provider.ts";

// ShippingProvider abstraction (DECISIONS.md ADR-022/ADR-037/ADR-040).
// SHIPPING_PROVIDER resolves, in order: PostNordShippingProvider when all
// its required POSTNORD_* env vars are configured, else
// ShipmondoShippingProvider when all six SHIPMONDO_* vars are configured,
// else ManualShippingProvider (flat admin-entered fee, no external call) —
// the same "disclosed rather than faked" posture as
// PAYMENT_PROVIDER/GOOGLE_OAUTH_PROVIDER, so local dev with no carrier
// credentials at all still boots and checkout still works end-to-end, just
// without live carrier rates/booking. PostNord takes precedence over
// Shipmondo (an explicit choice — DECISIONS.md ADR-040 — not a default):
// only one SHIPPING_PROVIDER is active app-wide, so whichever one is chosen
// here "owns" the entire /shipping-methods list (a limitation this
// inherits, not introduces — the same was already true between Shipmondo
// and Manual before PostNord existed).
//
// Neither ShipmondoShippingProvider nor PostNordShippingProvider is
// registered as its own standalone provider — Nest would eagerly construct
// it (and its config-validating constructor would throw) on every boot,
// including when it isn't configured at all, defeating the fallback below
// entirely (same reasoning as PaymentsModule's own comment).
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
        const postnordConfigured =
          Boolean(config.get("POSTNORD_API_KEY", { infer: true })) &&
          Boolean(config.get("POSTNORD_BASE_URL", { infer: true })) &&
          Boolean(config.get("POSTNORD_CUSTOMER_KEY", { infer: true })) &&
          Boolean(config.get("POSTNORD_CUSTOMER_NUMBER", { infer: true })) &&
          Boolean(config.get("POSTNORD_SENDER_ADDRESS1", { infer: true })) &&
          Boolean(config.get("POSTNORD_SENDER_ZIPCODE", { infer: true })) &&
          Boolean(config.get("POSTNORD_SENDER_CITY", { infer: true }));
        if (postnordConfigured) return new PostNordShippingProvider(config, prisma);

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
