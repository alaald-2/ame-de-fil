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
}

export interface PaymentProvider {
  // Runs inside checkout's own transaction (accepts an explicit Prisma
  // client) so the Payment row is created atomically with the Order,
  // OrderItems, and StockReservations — never as a separate, out-of-band write.
  createPayment(tx: Prisma.TransactionClient, input: CreatePaymentInput): Promise<PaymentRecord>;
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
}
