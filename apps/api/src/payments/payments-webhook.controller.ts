import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  type RawBodyRequest,
} from "@nestjs/common";
import { ApiExcludeController, ApiHeader } from "@nestjs/swagger";
import type { Request } from "express";
import { Public } from "../common/decorators/public.decorator.ts";
import { SkipCsrf } from "../common/csrf/skip-csrf.decorator.ts";
import { PAYMENT_PROVIDER, type PaymentProvider } from "./payment-provider.ts";
import { PaymentsWebhookService } from "./payments-webhook.service.ts";

const STRIPE_SIGNATURE_HEADER = "stripe-signature";

// @Public() — no session, this is not a cookie-authenticated caller.
// @SkipCsrf() — csrf.guard.ts's own comment reserves this exact escape
// hatch for "a future Stripe webhook controller, verified by signature
// instead". No @RequirePermissions (there is no caller identity to hold
// one) and deliberately no @RateLimit — Stripe's own delivery cadence
// governs volume; per-IP throttling here risks dropping genuine retries
// during a delivery burst (PAYMENTS.md §5).
@ApiExcludeController() // Not a client-facing endpoint — apps/storefront and apps/admin never call this; only Stripe does.
@Controller("payments/webhooks")
@Public()
@SkipCsrf()
export class PaymentsWebhookController {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
    private readonly webhook: PaymentsWebhookService,
  ) {}

  @Post("stripe")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: STRIPE_SIGNATURE_HEADER, required: true })
  async handleStripeWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers(STRIPE_SIGNATURE_HEADER) signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!signature || !request.rawBody) {
      // Malformed/incomplete delivery — reject with no side effects
      // (SECURITY.md §6), same posture as a bad signature.
      throw new BadRequestException({ error: "InvalidWebhook", message: "Missing signature" });
    }

    // verifyWebhookSignature throws a plain Error (Stripe's own
    // SignatureVerificationError) on an invalid/mis-signed payload — that
    // must become a 400 explicitly (an uncaught plain Error would
    // otherwise surface as Nest's default 500, which is the wrong signal
    // here: this is a rejected/malformed request, not a server fault), and
    // nothing is written or processed either way.
    let event;
    try {
      event = this.paymentProvider.verifyWebhookSignature(request.rawBody, signature);
    } catch {
      throw new BadRequestException({
        error: "InvalidWebhookSignature",
        message: "Signature verification failed",
      });
    }

    await this.webhook.handle(event);

    // 200 unconditionally once processing completes without throwing —
    // including for "irrelevant" event types, which Stripe's own guidance
    // is to acknowledge rather than error on.
    return { received: true };
  }
}
