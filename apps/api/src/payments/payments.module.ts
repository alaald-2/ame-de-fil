import { Module } from "@nestjs/common";
import { PAYMENT_PROVIDER, PendingPaymentProvider } from "./payment-provider.ts";

// PaymentProvider abstraction (PAYMENTS.md, DECISIONS.md ADR-014) — only
// the order/payment integration boundary exists this checkpoint
// (PendingPaymentProvider records a PENDING Payment row with no processor
// call). Stripe Card/Klarna/Swish, webhook handling, and refunds are the
// next checkpoint's job and only ever require a different PAYMENT_PROVIDER
// implementation.
@Module({
  providers: [{ provide: PAYMENT_PROVIDER, useClass: PendingPaymentProvider }],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentsModule {}
