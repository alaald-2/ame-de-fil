import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { PaymentStatus, type Prisma } from "@ame-de-fil/database";
import type { Env } from "@ame-de-fil/config";
import type {
  CreatePaymentInput,
  PaymentProvider,
  PaymentRecord,
  VerifiedWebhookEvent,
  VerifiedWebhookOutcome,
} from "./payment-provider.ts";

// PAYMENTS.md, DECISIONS.md ADR-014/ADR-024. Automatic capture for v1 card
// payments (the simplest match to PRODUCT_SPEC.md §4's scope — no
// delayed-capture admin workflow exists); PaymentStatus.AUTHORIZED stays
// unused for v1, reserved for a future manual-capture or Klarna/Swish flow,
// the same way User.totpSecret is reserved-but-unused per ADR-015.
const HANDLED_EVENT_TYPES: Record<string, VerifiedWebhookOutcome> = {
  "payment_intent.succeeded": "succeeded",
  "payment_intent.payment_failed": "failed",
  "payment_intent.canceled": "canceled",
};

@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService<Env, true>) {
    const secretKey = this.config.get("STRIPE_SECRET_KEY", { infer: true });
    const webhookSecret = this.config.get("STRIPE_WEBHOOK_SECRET", { infer: true });
    if (!secretKey || !webhookSecret) {
      // PaymentsModule's factory is the only intended caller path here and
      // already gates on both being set — this is a defensive second check,
      // not the primary validation point, so a future direct instantiation
      // can't silently skip it.
      throw new Error(
        "StripePaymentProvider requires both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET",
      );
    }
    this.stripe = new Stripe(secretKey);
    this.webhookSecret = webhookSecret;
  }

  // Runs inside CheckoutService's existing single checkout transaction
  // (DECISIONS.md ADR-024 / PAYMENTS.md §"Transaction boundaries" — kept as
  // today's architecture, not redesigned this checkpoint). The Stripe API
  // call itself sits inside that transaction's lock-holding window; the
  // idempotencyKey below is what makes CheckoutService's own
  // orderNumber-collision retry loop safe to call this twice for what is
  // logically one checkout attempt (Stripe returns the same PaymentIntent
  // rather than creating a duplicate). A post-Stripe-call transaction
  // rollback for any other reason can still orphan an uncharged
  // PaymentIntent at Stripe with no local Order/Payment row — an accepted
  // v1 trade-off (see PAYMENTS.md, not a bug), left for a future
  // reconciliation job to sweep, not solved by a bigger transactional
  // redesign here.
  async createPayment(
    tx: Prisma.TransactionClient,
    input: CreatePaymentInput,
  ): Promise<PaymentRecord> {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: input.amountMinor,
        currency: input.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: { orderId: input.orderId },
      },
      { idempotencyKey: `checkout-payment-intent:${input.orderId}` },
    );

    const payment = await tx.payment.create({
      data: {
        orderId: input.orderId,
        provider: "stripe",
        providerPaymentIntentId: intent.id,
        status: PaymentStatus.PENDING,
        amountMinor: input.amountMinor,
        currency: input.currency,
      },
    });

    return {
      id: payment.id,
      provider: payment.provider,
      status: payment.status,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      clientSecret: intent.client_secret ?? undefined,
    };
  }

  // SECURITY.md §6: every inbound webhook is signature-verified before any
  // processing; an unsigned/mis-signed payload is rejected with no side
  // effects. Throws (never returns an "irrelevant"-outcome event) on a bad
  // signature — the caller (PaymentsWebhookController) turns that into a
  // 400 with nothing written.
  verifyWebhookSignature(rawBody: Buffer, signature: string): VerifiedWebhookEvent {
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    const outcome = HANDLED_EVENT_TYPES[event.type] ?? "irrelevant";

    // Every event type this provider handles is a payment_intent.* event,
    // so event.data.object is a PaymentIntent — but Stripe.Event's type is
    // a discriminated union keyed on event.type, and "irrelevant" events
    // may carry any object shape at all, so the id is only trusted when the
    // event is one we actually recognize.
    const providerPaymentIntentId =
      outcome === "irrelevant"
        ? null
        : ((event.data.object as Stripe.PaymentIntent).id ?? null);

    return {
      providerEventId: event.id,
      eventType: event.type,
      providerPaymentIntentId,
      outcome,
      raw: event,
    };
  }
}
