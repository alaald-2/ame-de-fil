import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { type Transporter } from "nodemailer";
import type { Env } from "@ame-de-fil/config";

// Provider-agnostic dispatch boundary (mirrors PaymentProvider/ShippingProvider
// — DECISIONS.md ADR-014/ADR-022): NotificationsService depends only on this,
// never on nodemailer or a specific vendor SDK directly.
export const EMAIL_PROVIDER = Symbol("EMAIL_PROVIDER");

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

const DEFAULT_FROM = "no-reply@amedefil.se";

// Generic SMTP, not a vendor-specific API integration (DECISIONS.md ADR-031)
// — real vendor selection remains deferred (ROADMAP.md Phase 4), same as
// the deployment/image-storage/shipping-carrier choices. Any SMTP-speaking
// service (a real vendor, or the local Mailpit catcher — docker-compose.yml)
// works against this unchanged.
@Injectable()
export class SmtpEmailProvider implements EmailProvider {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    const host = config.get("SMTP_HOST", { infer: true });
    const port = config.get("SMTP_PORT", { infer: true }) ?? 587;
    this.from = config.get("SMTP_FROM", { infer: true }) ?? DEFAULT_FROM;
    this.transporter = nodemailer.createTransport({ host, port, secure: false });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}

// Fallback when no SMTP host is configured — the same "disclosed, not
// faked" posture as PendingPaymentProvider: it never pretends to send mail,
// it throws a clear, specific error that NotificationsService catches and
// records as a FAILED Notification row, so local dev without SMTP
// configured still boots and every other order/shipment write still
// succeeds, just without a real email going out.
@Injectable()
export class PendingEmailProvider implements EmailProvider {
  private readonly logger = new Logger(PendingEmailProvider.name);

  async send(_message: EmailMessage): Promise<void> {
    this.logger.warn("No email provider configured (SMTP_HOST unset) — email not sent");
    throw new Error("PendingEmailProvider cannot send email — no email provider is configured");
  }
}
