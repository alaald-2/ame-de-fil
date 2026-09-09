import { describe, expect, it, vi, beforeEach } from "vitest";
import { Locale, NotificationStatus } from "@ame-de-fil/database";
import { NotificationsService } from "./notifications.service.ts";
import type { EmailProvider } from "./email-provider.ts";
import type { PrismaService } from "../database/prisma.service.ts";

const ORDER = {
  id: "order-1",
  orderNumber: "AF-2026-000123",
  userId: null as string | null,
  guestEmail: "customer@example.com",
  locale: Locale.sv_SE,
  currency: "SEK",
  subtotalMinor: 10000,
  shippingMinor: 4900,
  discountMinor: 0,
  totalMinor: 14900,
  shippingName: "Test Testsson",
  shippingLine1: "Testgatan 1",
  shippingLine2: null,
  shippingPostalCode: "11122",
  shippingCity: "Stockholm",
  shippingCountry: "SE",
  items: [
    {
      productNameSnapshot: "Handstickad tröja",
      variantLabelSnapshot: "M",
      quantity: 1,
      unitPriceMinor: 10000,
      lineTotalMinor: 10000,
    },
  ],
  user: null as { email: string } | null,
};

const SHIPMENT = {
  id: "ship-1",
  carrierName: "PostNord",
  trackingNumber: "ABC123",
  trackingUrl: "https://track.example.com/ABC123",
};

function makePrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    order: { findUnique: vi.fn().mockResolvedValue(ORDER) },
    shipment: { findFirst: vi.fn().mockResolvedValue(SHIPMENT) },
    notification: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "notif-1" }),
      update: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  } as unknown as PrismaService & {
    order: { findUnique: ReturnType<typeof vi.fn> };
    shipment: { findFirst: ReturnType<typeof vi.fn> };
    notification: {
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
}

function makeEmailProviderMock() {
  return { send: vi.fn().mockResolvedValue(undefined) } as unknown as EmailProvider & {
    send: ReturnType<typeof vi.fn>;
  };
}

describe("NotificationsService.sendOrderConfirmation", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let emailProvider: ReturnType<typeof makeEmailProviderMock>;
  let service: NotificationsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    emailProvider = makeEmailProviderMock();
    service = new NotificationsService(prisma, emailProvider);
  });

  it("creates a PENDING Notification, sends the email, and marks it SENT", async () => {
    await service.sendOrderConfirmation("order-1");

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: null,
        type: "order-confirmation",
        payload: { orderId: "order-1", orderNumber: "AF-2026-000123" },
        status: NotificationStatus.PENDING,
      },
    });
    expect(emailProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "customer@example.com", subject: expect.stringContaining("AF-2026-000123") }),
    );
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: "notif-1" },
      data: { status: NotificationStatus.SENT, sentAt: expect.any(Date) },
    });
  });

  it("resolves the recipient from the account email when there's no guest email", async () => {
    prisma.order.findUnique.mockResolvedValue({ ...ORDER, guestEmail: null, user: { email: "user@example.com" } });

    await service.sendOrderConfirmation("order-1");

    expect(emailProvider.send).toHaveBeenCalledWith(expect.objectContaining({ to: "user@example.com" }));
  });

  it("never throws when sending fails, and marks the Notification FAILED instead", async () => {
    emailProvider.send.mockRejectedValue(new Error("SMTP unreachable"));

    await expect(service.sendOrderConfirmation("order-1")).resolves.toBeUndefined();

    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: "notif-1" },
      data: { status: NotificationStatus.FAILED },
    });
  });

  it("is a no-op, with no Notification row created, when the order has no email on file", async () => {
    prisma.order.findUnique.mockResolvedValue({ ...ORDER, guestEmail: null, user: null });

    await service.sendOrderConfirmation("order-1");

    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
  });

  it("is a no-op when the order doesn't exist", async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    await expect(service.sendOrderConfirmation("missing")).resolves.toBeUndefined();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("skips sending a second confirmation once one has already SENT for this order (idempotency guard)", async () => {
    prisma.notification.findFirst.mockResolvedValue({ id: "notif-0" });

    await service.sendOrderConfirmation("order-1");

    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: {
        type: "order-confirmation",
        status: NotificationStatus.SENT,
        payload: { path: ["orderId"], equals: "order-1" },
      },
      select: { id: true },
    });
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
  });
});

describe("NotificationsService.sendShippingNotification", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let emailProvider: ReturnType<typeof makeEmailProviderMock>;
  let service: NotificationsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    emailProvider = makeEmailProviderMock();
    service = new NotificationsService(prisma, emailProvider);
  });

  it("creates a PENDING Notification carrying the shipment id, sends the email, and marks it SENT", async () => {
    await service.sendShippingNotification("order-1");

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: null,
        type: "shipping-notification",
        payload: { orderId: "order-1", orderNumber: "AF-2026-000123", shipmentId: "ship-1" },
        status: NotificationStatus.PENDING,
      },
    });
    expect(emailProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "customer@example.com", html: expect.stringContaining("ABC123") }),
    );
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: "notif-1" },
      data: { status: NotificationStatus.SENT, sentAt: expect.any(Date) },
    });
  });

  it("still sends (with no tracking details) when there's no Shipment row yet", async () => {
    prisma.shipment.findFirst.mockResolvedValue(null);

    await service.sendShippingNotification("order-1");

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ payload: expect.objectContaining({ shipmentId: null }) }) }),
    );
    expect(emailProvider.send).toHaveBeenCalled();
  });

  it("never throws when sending fails, and marks the Notification FAILED instead", async () => {
    emailProvider.send.mockRejectedValue(new Error("SMTP unreachable"));

    await expect(service.sendShippingNotification("order-1")).resolves.toBeUndefined();

    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: "notif-1" },
      data: { status: NotificationStatus.FAILED },
    });
  });
});
