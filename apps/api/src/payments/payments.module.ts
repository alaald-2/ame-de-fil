import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { NotificationsModule } from "../notifications/notifications.module.ts";
import { PAYMENT_PROVIDER, PendingPaymentProvider, type PaymentProvider } from "./payment-provider.ts";
import { StripePaymentProvider } from "./stripe-payment.provider.ts";
import { PaymentsWebhookController } from "./payments-webhook.controller.ts";
import { PaymentsWebhookService } from "./payments-webhook.service.ts";

// PaymentProvider abstraction (PAYMENTS.md, DECISIONS.md ADR-014/ADR-024).
// PAYMENT_PROVIDER resolves to StripePaymentProvider when Stripe is
// configured, PendingPaymentProvider (no processor call at all) otherwise
// — the same "disclosed rather than faked" posture already used elsewhere
// in this project for infra gaps (Docker, reservation-expiry scheduling),
// so local dev without Stripe test keys still boots and checkout still
// works end-to-end, just without a real payment.
//
// StripePaymentProvider is deliberately *not* registered as its own
// standalone provider here — Nest would eagerly construct it (and its
// config-validating constructor would throw) on every boot, including
// when Stripe isn't configured at all, defeating the fallback below
// entirely. Constructing it only inside the factory, only when both env
// vars are actually present, is what makes the fallback real rather than
// theoretical.
@Module({
  imports: [NotificationsModule],
  controllers: [PaymentsWebhookController],
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (config: ConfigService<Env, true>): PaymentProvider => {
        const stripeConfigured =
          Boolean(config.get("STRIPE_SECRET_KEY", { infer: true })) &&
          Boolean(config.get("STRIPE_WEBHOOK_SECRET", { infer: true }));
        return stripeConfigured ? new StripePaymentProvider(config) : new PendingPaymentProvider();
      },
      inject: [ConfigService],
    },
    PaymentsWebhookService,
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentsModule {}
