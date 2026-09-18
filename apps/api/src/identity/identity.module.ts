import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { NotificationsModule } from "../notifications/notifications.module.ts";
import { SessionService } from "./session.service.ts";
import { PasswordService } from "./password.service.ts";
import { AuthService } from "./auth.service.ts";
import { AuthController } from "./auth.controller.ts";
import {
  GOOGLE_OAUTH_PROVIDER,
  GoogleOAuthClient,
  PendingOAuthProvider,
  type GoogleOAuthProvider,
} from "./google-oauth.provider.ts";

// Users/roles/sessions (ARCHITECTURE.md §3). The real auth entry point —
// login/logout/session issuance (DECISIONS.md ADR-032), Google sign-in
// (ADR-033), and self-service registration/email-verification/password-reset
// (a later ADR) — is AuthController/AuthService, built directly on the
// pre-existing SessionService/PasswordService without changing either.
// NotificationsModule is imported for AuthService's verification/reset email
// dispatch. GOOGLE_OAUTH_PROVIDER resolves to GoogleOAuthClient when all
// three GOOGLE_*/STOREFRONT_BASE_URL vars are configured, PendingOAuthProvider
// otherwise — the same factory idiom as PaymentsModule's PAYMENT_PROVIDER/
// NotificationsModule's EMAIL_PROVIDER: GoogleOAuthClient is deliberately not
// registered as its own standalone provider, so Nest never eagerly
// constructs it (or requires the env vars) when Google sign-in isn't
// configured at all.
@Module({
  imports: [NotificationsModule],
  controllers: [AuthController],
  providers: [
    SessionService,
    PasswordService,
    AuthService,
    {
      provide: GOOGLE_OAUTH_PROVIDER,
      useFactory: (config: ConfigService<Env, true>): GoogleOAuthProvider => {
        const clientId = config.get("GOOGLE_CLIENT_ID", { infer: true });
        const clientSecret = config.get("GOOGLE_CLIENT_SECRET", { infer: true });
        const redirectUri = config.get("GOOGLE_OAUTH_REDIRECT_URI", { infer: true });
        const storefrontBaseUrl = config.get("STOREFRONT_BASE_URL", { infer: true });
        const configured = Boolean(clientId && clientSecret && redirectUri && storefrontBaseUrl);
        return configured
          ? new GoogleOAuthClient(clientId!, clientSecret!, redirectUri!)
          : new PendingOAuthProvider();
      },
      inject: [ConfigService],
    },
  ],
  exports: [SessionService, PasswordService],
})
export class IdentityModule {}
