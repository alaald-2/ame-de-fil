import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import { PaymentStatus, type Prisma } from "@ame-de-fil/database";
import type { Env } from "@ame-de-fil/config";

const paymentIntentsCreate = vi.fn();
const webhooksConstructEvent = vi.fn();

vi.mock("stripe", () => ({
  // A plain `function`, not an arrow — vi.fn()'s `new`-invocation support
  // forwards to the implementation via a real constructor call, which
  // throws "is not a constructor" for an arrow function regardless of the
  // vi.fn() wrapper around it.
  default: vi.fn().mockImplementation(function StripeMock() {
    return {
      paymentIntents: { create: paymentIntentsCreate },
      webhooks: { constructEvent: webhooksConstructEvent },
    };
  }),
}));

// Imported after the mock so the module under test picks up the mocked
// "stripe" constructor.
const { StripePaymentProvider } = await import("./stripe-payment.provider.ts");

function makeConfigMock(overrides: Partial<Env> = {}): ConfigService<Env, true> {
  const values: Partial<Env> = {
    STRIPE_SECRET_KEY: "sk_test_example",
    STRIPE_WEBHOOK_SECRET: "whsec_example",
    ...overrides,
  };
  return { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;
}

function makeTxMock() {
  return {
    payment: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: "pay-1",
          provider: data.provider,
          providerPaymentIntentId: data.providerPaymentIntentId,
          status: data.status,
          amountMinor: data.amountMinor,
          currency: data.currency,
        }),
      ),
    },
  } as unknown as Prisma.TransactionClient;
}

describe("StripePaymentProvider", () => {
  beforeEach(() => {
    paymentIntentsCreate.mockReset();
    webhooksConstructEvent.mockReset();
  });

  it("throws at construction if STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is missing", () => {
    expect(
      () => new StripePaymentProvider(makeConfigMock({ STRIPE_SECRET_KEY: undefined })),
    ).toThrow(/requires both/i);
    expect(
      () => new StripePaymentProvider(makeConfigMock({ STRIPE_WEBHOOK_SECRET: undefined })),
    ).toThrow(/requires both/i);
  });

  describe("createPayment", () => {
    it("creates a Stripe PaymentIntent with server-computed amount/currency and an order-scoped idempotency key", async () => {
      paymentIntentsCreate.mockResolvedValue({
        id: "pi_123",
        client_secret: "pi_123_secret_abc",
      });
      const provider = new StripePaymentProvider(makeConfigMock());
      const tx = makeTxMock();

      const result = await provider.createPayment(tx, {
        orderId: "order-1",
        amountMinor: 64500,
        currency: "SEK",
      });

      expect(paymentIntentsCreate).toHaveBeenCalledWith(
        {
          amount: 64500,
          currency: "sek",
          automatic_payment_methods: { enabled: true },
          metadata: { orderId: "order-1" },
        },
        { idempotencyKey: "checkout-payment-intent:order-1" },
      );
      expect(tx.payment.create).toHaveBeenCalledWith({
        data: {
          orderId: "order-1",
          provider: "stripe",
          providerPaymentIntentId: "pi_123",
          status: PaymentStatus.PENDING,
          amountMinor: 64500,
          currency: "SEK",
        },
      });
      expect(result).toEqual({
        id: "pay-1",
        provider: "stripe",
        status: PaymentStatus.PENDING,
        amountMinor: 64500,
        currency: "SEK",
        clientSecret: "pi_123_secret_abc",
      });
    });

    it("omits clientSecret when Stripe returns none", async () => {
      paymentIntentsCreate.mockResolvedValue({ id: "pi_123", client_secret: null });
      const provider = new StripePaymentProvider(makeConfigMock());

      const result = await provider.createPayment(makeTxMock(), {
        orderId: "order-1",
        amountMinor: 1000,
        currency: "SEK",
      });

      expect(result.clientSecret).toBeUndefined();
    });
  });

  describe("verifyWebhookSignature", () => {
    it("maps payment_intent.succeeded to outcome 'succeeded' with the PaymentIntent id", () => {
      webhooksConstructEvent.mockReturnValue({
        id: "evt_1",
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_123" } },
      });
      const provider = new StripePaymentProvider(makeConfigMock());

      const result = provider.verifyWebhookSignature(Buffer.from("{}"), "sig");

      expect(result).toEqual({
        providerEventId: "evt_1",
        eventType: "payment_intent.succeeded",
        providerPaymentIntentId: "pi_123",
        outcome: "succeeded",
        raw: {
          id: "evt_1",
          type: "payment_intent.succeeded",
          data: { object: { id: "pi_123" } },
        },
      });
    });

    it.each([
      ["payment_intent.payment_failed", "failed"],
      ["payment_intent.canceled", "canceled"],
    ] as const)("maps %s to outcome '%s'", (eventType, outcome) => {
      webhooksConstructEvent.mockReturnValue({
        id: "evt_2",
        type: eventType,
        data: { object: { id: "pi_456" } },
      });
      const provider = new StripePaymentProvider(makeConfigMock());

      const result = provider.verifyWebhookSignature(Buffer.from("{}"), "sig");

      expect(result.outcome).toBe(outcome);
      expect(result.providerPaymentIntentId).toBe("pi_456");
    });

    it("maps an unrecognized event type to outcome 'irrelevant' with a null PaymentIntent id", () => {
      webhooksConstructEvent.mockReturnValue({
        id: "evt_3",
        type: "charge.dispute.created",
        data: { object: { id: "dp_1" } },
      });
      const provider = new StripePaymentProvider(makeConfigMock());

      const result = provider.verifyWebhookSignature(Buffer.from("{}"), "sig");

      expect(result.outcome).toBe("irrelevant");
      expect(result.providerPaymentIntentId).toBeNull();
    });

    it("propagates a signature-verification failure rather than returning an 'irrelevant' event", () => {
      webhooksConstructEvent.mockImplementation(() => {
        throw new Error("No signatures found matching the expected signature for payload");
      });
      const provider = new StripePaymentProvider(makeConfigMock());

      expect(() => provider.verifyWebhookSignature(Buffer.from("{}"), "bad-sig")).toThrow(
        /signature/i,
      );
    });
  });
});
