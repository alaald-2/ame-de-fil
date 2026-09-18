import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import {
  EMAIL_PROVIDER,
  PendingEmailProvider,
  SmtpEmailProvider,
  type EmailProvider,
} from "./email-provider.ts";
import { NotificationsService } from "./notifications.service.ts";

// Notification dispatch — transactional email (ARCHITECTURE.md §3/§5,
// DECISIONS.md ADR-031). EMAIL_PROVIDER resolves to SmtpEmailProvider when
// SMTP_HOST is configured, PendingEmailProvider (no send attempted, a clear
// error instead) otherwise — the same factory idiom as PaymentsModule's
// PAYMENT_PROVIDER: SmtpEmailProvider is deliberately not registered as its
// own standalone provider, since Nest would eagerly construct it (reading
// SMTP_HOST as required) on every boot, defeating the fallback.
@Module({
  providers: [
    {
      provide: EMAIL_PROVIDER,
      useFactory: (config: ConfigService<Env, true>): EmailProvider => {
        const smtpHost = config.get("SMTP_HOST", { infer: true });
        return smtpHost ? new SmtpEmailProvider(config) : new PendingEmailProvider();
      },
      inject: [ConfigService],
    },
    NotificationsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
