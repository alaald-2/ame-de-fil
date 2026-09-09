import { Module } from "@nestjs/common";
import { SessionService } from "./session.service.js";
import { PasswordService } from "./password.service.js";
import { AuthService } from "./auth.service.ts";
import { AuthController } from "./auth.controller.ts";

// Users/roles/sessions (ARCHITECTURE.md §3). The real auth entry point —
// login/logout/session issuance (DECISIONS.md ADR-032) — is AuthController/
// AuthService, built directly on the pre-existing SessionService/
// PasswordService without changing either. Registration/password-reset
// HTTP endpoints remain a later, real product surface, tracked separately.
@Module({
  controllers: [AuthController],
  providers: [SessionService, PasswordService, AuthService],
  exports: [SessionService, PasswordService],
})
export class IdentityModule {}
