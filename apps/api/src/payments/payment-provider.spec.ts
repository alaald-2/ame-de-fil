import { describe, expect, it, vi } from "vitest";
import { PaymentStatus, type Prisma } from "@ame-de-fil/database";
import { PendingPaymentProvider } from "./payment-provider.ts";

describe("PendingPaymentProvider.createPayment", () => {
  it("creates a PENDING payment row via the given transaction, calling no external processor", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "pay-1",
      provider: "pending",
      status: PaymentStatus.PENDING,
      amountMinor: 64500,
      currency: "SEK",
    });
    const tx = { payment: { create } } as unknown as Prisma.TransactionClient;
    const provider = new PendingPaymentProvider();

    const result = await provider.createPayment(tx, {
      orderId: "order-1",
      amountMinor: 64500,
      currency: "SEK",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        orderId: "order-1",
        provider: "pending",
        status: PaymentStatus.PENDING,
        amountMinor: 64500,
        currency: "SEK",
      },
    });
    expect(result).toEqual({
      id: "pay-1",
      provider: "pending",
      status: PaymentStatus.PENDING,
      amountMinor: 64500,
      currency: "SEK",
    });
  });
});
