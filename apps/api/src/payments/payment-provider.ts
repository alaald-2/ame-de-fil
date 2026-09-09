import { Injectable } from "@nestjs/common";
import { PaymentStatus, type Prisma } from "@ame-de-fil/database";

// PAYMENTS.md (Stripe-unified for v1, ADR-014). Checkout depends on this
// interface only — establishing the order/payment integration boundary is
// this checkpoint's job; a real Stripe Card/Klarna/Swish implementation is
// the *next* checkpoint's, and will only ever need to provide a different
// PAYMENT_PROVIDER implementation, never touch CheckoutService.
export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");

export interface CreatePaymentInput {
  orderId: string;
  amountMinor: number;
  currency: "SEK";
}

export interface PaymentRecord {
  id: string;
  provider: string;
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  // Only set by a real processor that needs the browser to complete
  // confirmation client-side (Stripe's Payment Element). Undefined for
  // PendingPaymentProvider, which has nothing for the browser to confirm.
  clientSecret?: string;
}

// The provider-agnostic shape a verified inbound webhook is normalized to
// before it ever reaches business logic (PaymentsWebhookService) — that
// service depends only on this, never on a provider SDK's own event type.
// "paymentMethodRecorded" is informational only (DECISIONS.md ADR-028) —
// it never drives an Order/Payment state transition, only records which
// underlying method (card/klarna/swish) a payment actually used.
export type VerifiedWebhookOutcome =
  | "succeeded"
  | "failed"
  | "canceled"
  | "paymentMethodRecorded"
  | "irrelevant";

export interface VerifiedWebhookEvent {
  providerEventId: string;
  eventType: string;
  providerPaymentIntentId: string | null;
  outcome: VerifiedWebhookOutcome;
  // Only meaningful (and only ever set) for outcome === "paymentMethodRecorded".
  paymentMethodType?: string | null;
  raw: unknown;
}

export interface PaymentProvider {
  // Runs inside checkout's own transaction (accepts an explicit Prisma
  // client) so the Payment row is created atomically with the Order,
  // OrderItems, and StockReservations — never as a separate, out-of-band write.
  createPayment(tx: Prisma.TransactionClient, input: CreatePaymentInput): Promise<PaymentRecord>;

  // Verifies an inbound webhook's signature and normalizes it to a
  // VerifiedWebhookEvent. Throws on an invalid/unverifiable signature —
  // callers must treat that as "reject with no side effects"
  // (SECURITY.md §6), never as an "irrelevant" outcome.
  verifyWebhookSignature(rawBody: Buffer, signature: string): VerifiedWebhookEvent;
}

// v1: records a PENDING payment placeholder and does not call any real
// processor — no Stripe SDK, no client secret, no card/Klarna/Swish. This
// exists purely to make the Order -> Payment boundary real (a Payment row
// exists, in the correct state, from the moment an order is created) so
// the next checkpoint's Stripe integration only has to *fill in* this
// interface, not redesign how checkout creates orders.
@Injectable()
export class PendingPaymentProvider implements PaymentProvider {
  async createPayment(
    tx: Prisma.TransactionClient,
    input: CreatePaymentInput,
  ): Promise<PaymentRecord> {
    const payment = await tx.payment.create({
      data: {
        orderId: input.orderId,
        // Deliberately not "stripe" (the schema's own default) — no
        // processor has actually been contacted yet, and labeling this
        // "stripe" would misrepresent that.
        provider: "pending",
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
    };
  }

  // No processor is contacted by this provider, so there is nothing to
  // verify a signature against — a webhook should never reach this
  // provider's binding in the first place (PaymentsModule only routes
  // webhook requests through PAYMENT_PROVIDER, and this provider is only
  // ever bound when Stripe isn't configured at all). Throwing here fails
  // loudly instead of pretending to verify something that can't be real.
  verifyWebhookSignature(): VerifiedWebhookEvent {
    throw new Error("PendingPaymentProvider cannot verify webhooks — no processor is configured");
  }
}
