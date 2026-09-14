import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { NotificationStatus, type Notification, type Prisma } from "@ame-de-fil/database";
import {
  renderOrderConfirmationEmail,
  renderShippingNotificationEmail,
  renderEmailVerificationEmail,
  renderPasswordResetEmail,
  renderLoginOtpEmail,
} from "@ame-de-fil/email";
import { PrismaService } from "../database/prisma.service.ts";
import { fromPrismaLocale } from "../common/locale.ts";
import { EMAIL_PROVIDER, type EmailProvider } from "./email-provider.ts";

// String literals, not a Prisma enum — Notification.type is a plain String
// column (packages/database/prisma/schema.prisma), left un-enumerated at
// the schema level so a future notification type doesn't need a migration.
const NotificationType = {
  ORDER_CONFIRMATION: "order-confirmation",
  SHIPPING_NOTIFICATION: "shipping-notification",
  EMAIL_VERIFICATION: "email-verification",
  PASSWORD_RESET: "password-reset",
  LOGIN_OTP: "login-otp",
} as const;

// Sends transactional email and records the outcome as a Notification row.
// Called only *after* the order/shipment-mutating transaction that triggers
// it has already committed (payments-webhook.service.ts,
// admin-orders.service.ts) — never from inside one, so an SMTP round-trip
// can never hold that transaction's locks open, and a slow/failed send can
// never roll back the order/shipment write it followed (DECISIONS.md
// ADR-031). Every public method here is a catch-all: it must never be able
// to fail its caller, so a render/send failure is caught, logged, and
// recorded as a FAILED Notification row, never rethrown.
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async sendOrderConfirmation(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, user: { select: { email: true } } },
    });
    if (!order) {
      this.logger.warn(`sendOrderConfirmation: Order "${orderId}" not found`);
      return;
    }

    const email = order.guestEmail ?? order.user?.email;
    if (!email) {
      this.logger.warn(`sendOrderConfirmation: Order "${orderId}" has no email address on file`);
      return;
    }

    if (await this.wasAlreadySent(NotificationType.ORDER_CONFIRMATION, orderId)) return;

    const notification = await this.createPending(order.userId, NotificationType.ORDER_CONFIRMATION, {
      orderId,
      orderNumber: order.orderNumber,
    });

    try {
      const rendered = await renderOrderConfirmationEmail({
        locale: fromPrismaLocale(order.locale),
        orderNumber: order.orderNumber,
        items: order.items.map((item) => ({
          name: item.productNameSnapshot,
          variantLabel: item.variantLabelSnapshot,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
          lineTotalMinor: item.lineTotalMinor,
        })),
        subtotalMinor: order.subtotalMinor,
        shippingMinor: order.shippingMinor,
        discountMinor: order.discountMinor,
        totalMinor: order.totalMinor,
        currency: order.currency,
        shippingAddress: {
          name: order.shippingName,
          line1: order.shippingLine1,
          line2: order.shippingLine2,
          postalCode: order.shippingPostalCode,
          city: order.shippingCity,
          country: order.shippingCountry,
        },
      });

      await this.emailProvider.send({ to: email, ...rendered });
      await this.markSent(notification.id);
    } catch (error) {
      await this.markFailed(notification.id, error);
    }
  }

  async sendShippingNotification(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { user: { select: { email: true } } },
    });
    if (!order) {
      this.logger.warn(`sendShippingNotification: Order "${orderId}" not found`);
      return;
    }

    const email = order.guestEmail ?? order.user?.email;
    if (!email) {
      this.logger.warn(`sendShippingNotification: Order "${orderId}" has no email address on file`);
      return;
    }

    if (await this.wasAlreadySent(NotificationType.SHIPPING_NOTIFICATION, orderId)) return;

    // Most recent Shipment — same "one shipment per order in practice, but
    // orderId isn't unique" reasoning as admin-orders.service.ts's own
    // toResponse().
    const shipment = await this.prisma.shipment.findFirst({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    });

    const notification = await this.createPending(order.userId, NotificationType.SHIPPING_NOTIFICATION, {
      orderId,
      orderNumber: order.orderNumber,
      shipmentId: shipment?.id ?? null,
    });

    try {
      const rendered = await renderShippingNotificationEmail({
        locale: fromPrismaLocale(order.locale),
        orderNumber: order.orderNumber,
        carrierName: shipment?.carrierName ?? null,
        trackingNumber: shipment?.trackingNumber ?? null,
        trackingUrl: shipment?.trackingUrl ?? null,
      });

      await this.emailProvider.send({ to: email, ...rendered });
      await this.markSent(notification.id);
    } catch (error) {
      await this.markFailed(notification.id, error);
    }
  }

  // Unlike the two methods above, deliberately skips wasAlreadySent(): an
  // order-confirmation email is one immutable event that must never
  // double-send on a replayed webhook, but every verification/reset send
  // here is a distinct, deliberate action (register, or a fresh resend
  // request) — already rate-limited and (for reset) token-invalidated
  // upstream in AuthService, so reusing that idempotency query would wrongly
  // block a legitimate second resend.
  async sendVerificationEmail(userId: string, plaintextToken: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, locale: true },
    });
    if (!user) {
      this.logger.warn(`sendVerificationEmail: User "${userId}" not found`);
      return;
    }

    const notification = await this.createPending(userId, NotificationType.EMAIL_VERIFICATION, { userId });
    const storefrontBaseUrl = this.config.get("STOREFRONT_BASE_URL", { infer: true });
    if (!storefrontBaseUrl) {
      // Disclosed, not faked (DECISIONS.md ADR-033's Google-flow posture) —
      // never falls back to a hardcoded dev URL in a real email link.
      await this.markFailed(notification.id, new Error("STOREFRONT_BASE_URL is not configured"));
      return;
    }

    try {
      const rendered = await renderEmailVerificationEmail({
        locale: fromPrismaLocale(user.locale),
        verificationUrl: `${storefrontBaseUrl}/verify-email?token=${plaintextToken}`,
      });
      await this.emailProvider.send({ to: user.email, ...rendered });
      await this.markSent(notification.id);
    } catch (error) {
      await this.markFailed(notification.id, error);
    }
  }

  async sendPasswordResetEmail(userId: string, plaintextToken: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, locale: true },
    });
    if (!user) {
      this.logger.warn(`sendPasswordResetEmail: User "${userId}" not found`);
      return;
    }

    const notification = await this.createPending(userId, NotificationType.PASSWORD_RESET, { userId });
    const storefrontBaseUrl = this.config.get("STOREFRONT_BASE_URL", { infer: true });
    if (!storefrontBaseUrl) {
      await this.markFailed(notification.id, new Error("STOREFRONT_BASE_URL is not configured"));
      return;
    }

    try {
      const rendered = await renderPasswordResetEmail({
        locale: fromPrismaLocale(user.locale),
        resetUrl: `${storefrontBaseUrl}/reset-password?token=${plaintextToken}`,
      });
      await this.emailProvider.send({ to: user.email, ...rendered });
      await this.markSent(notification.id);
    } catch (error) {
      await this.markFailed(notification.id, error);
    }
  }

  // Deliberately skips wasAlreadySent() and, unlike the two link-based
  // methods above, needs no STOREFRONT_BASE_URL at all — there's no link,
  // just a code to display, one less local-dev configuration dependency.
  async sendLoginOtpEmail(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, locale: true },
    });
    if (!user) {
      this.logger.warn(`sendLoginOtpEmail: User "${userId}" not found`);
      return;
    }

    const notification = await this.createPending(userId, NotificationType.LOGIN_OTP, { userId });

    try {
      const rendered = await renderLoginOtpEmail({ locale: fromPrismaLocale(user.locale), code });
      await this.emailProvider.send({ to: user.email, ...rendered });
      await this.markSent(notification.id);
    } catch (error) {
      await this.markFailed(notification.id, error);
    }
  }

  // Best-effort, application-level idempotency guard, not a DB-level
  // guarantee (DECISIONS.md ADR-031): Notification carries no unique
  // constraint tying a row to (orderId, type) — payload is a free-form Json
  // column, so this can only ever be a query, never a constraint a
  // concurrent double-invocation is guaranteed to collide against. It does
  // cover the realistic case this project actually has, though: the same
  // trigger point (a replayed webhook delivery, a retried admin action)
  // firing again for an order that already has a successfully-sent
  // notification of this type never sends a second one.
  private async wasAlreadySent(type: string, orderId: string): Promise<boolean> {
    const existing = await this.prisma.notification.findFirst({
      where: { type, status: NotificationStatus.SENT, payload: { path: ["orderId"], equals: orderId } },
      select: { id: true },
    });
    return existing !== null;
  }

  private async createPending(
    userId: string | null,
    type: string,
    payload: Prisma.InputJsonValue,
  ): Promise<Notification> {
    return this.prisma.notification.create({
      data: { userId, type, payload, status: NotificationStatus.PENDING },
    });
  }

  private async markSent(id: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: { status: NotificationStatus.SENT, sentAt: new Date() },
    });
  }

  private async markFailed(id: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Notification "${id}" failed to send: ${message}`);
    await this.prisma.notification.update({
      where: { id },
      data: { status: NotificationStatus.FAILED },
    });
  }
}
