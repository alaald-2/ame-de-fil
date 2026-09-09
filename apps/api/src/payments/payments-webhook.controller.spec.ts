import { describe, expect, it, afterEach, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import supertest from "supertest";
import { PaymentsWebhookController } from "./payments-webhook.controller.ts";
import { PaymentsWebhookService } from "./payments-webhook.service.ts";
import { PAYMENT_PROVIDER } from "./payment-provider.ts";
import { SessionAuthGuard } from "../common/guards/session-auth.guard.ts";
import { PermissionsGuard } from "../common/guards/permissions.guard.ts";
import { CsrfGuard } from "../common/csrf/csrf.guard.ts";
import { SessionService } from "../identity/session.service.ts";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter.ts";

async function bootApp() {
  const verifyWebhookSignature = vi.fn();
  const handle = vi.fn().mockResolvedValue(undefined);
  const validateSession = vi.fn().mockResolvedValue(null);

  const moduleRef = await Test.createTestingModule({
    controllers: [PaymentsWebhookController],
    providers: [
      { provide: PAYMENT_PROVIDER, useValue: { verifyWebhookSignature } },
      { provide: PaymentsWebhookService, useValue: { handle } },
      { provide: SessionService, useValue: { validateSession } },
      { provide: ConfigService, useValue: { get: () => "ame_session" } },
      // Real guard chain — proving @Public()/@SkipCsrf() actually exempt
      // this route, not just documenting the intent to.
      { provide: APP_GUARD, useClass: SessionAuthGuard },
      { provide: APP_GUARD, useClass: PermissionsGuard },
      { provide: APP_GUARD, useClass: CsrfGuard },
    ],
  }).compile();

  // rawBody: true mirrors main.ts's bootstrap — without it, req.rawBody is
  // never populated and every request would hit the "missing body" branch
  // regardless of the signature header.
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, verifyWebhookSignature, handle, validateSession };
}

const SUCCEEDED_EVENT = {
  providerEventId: "evt_1",
  eventType: "payment_intent.succeeded",
  providerPaymentIntentId: "pi_1",
  outcome: "succeeded" as const,
  raw: { id: "evt_1" },
};

describe("POST /payments/webhooks/stripe", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("is reachable with no session cookie and no CSRF header (@Public + @SkipCsrf)", async () => {
    const booted = await bootApp();
    booted.verifyWebhookSignature.mockReturnValue(SUCCEEDED_EVENT);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/payments/webhooks/stripe")
      .set("stripe-signature", "t=1,v1=abc")
      .send({ id: "evt_1" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
    expect(booted.validateSession).not.toHaveBeenCalled();
  });

  it("verifies the signature against the raw body and delegates to PaymentsWebhookService", async () => {
    const booted = await bootApp();
    booted.verifyWebhookSignature.mockReturnValue(SUCCEEDED_EVENT);
    app = booted.app;

    await supertest(app.getHttpServer())
      .post("/payments/webhooks/stripe")
      .set("stripe-signature", "t=1,v1=abc")
      .send({ id: "evt_1" });

    expect(booted.verifyWebhookSignature).toHaveBeenCalledWith(expect.any(Buffer), "t=1,v1=abc");
    expect(booted.handle).toHaveBeenCalledWith(SUCCEEDED_EVENT);
  });

  it("returns 400 with no processing when the stripe-signature header is missing", async () => {
    const booted = await bootApp();
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/payments/webhooks/stripe")
      .send({ id: "evt_1" });

    expect(response.status).toBe(400);
    expect(booted.verifyWebhookSignature).not.toHaveBeenCalled();
    expect(booted.handle).not.toHaveBeenCalled();
  });

  it("returns 400 with no processing when signature verification throws", async () => {
    const booted = await bootApp();
    booted.verifyWebhookSignature.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature for payload");
    });
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/payments/webhooks/stripe")
      .set("stripe-signature", "t=1,v1=bad")
      .send({ id: "evt_1" });

    expect(response.status).toBe(400);
    expect(booted.handle).not.toHaveBeenCalled();
  });

  it("returns 200 for an irrelevant event type without erroring", async () => {
    const booted = await bootApp();
    booted.verifyWebhookSignature.mockReturnValue({
      providerEventId: "evt_2",
      eventType: "charge.dispute.created",
      providerPaymentIntentId: null,
      outcome: "irrelevant" as const,
      raw: { id: "evt_2" },
    });
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/payments/webhooks/stripe")
      .set("stripe-signature", "t=1,v1=abc")
      .send({ id: "evt_2" });

    expect(response.status).toBe(200);
  });
});
