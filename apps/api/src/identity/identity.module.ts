import { Module } from "@nestjs/common";
import { SessionService } from "./session.service.js";
import { PasswordService } from "./password.service.js";

// Users/roles/sessions (ARCHITECTURE.md §3). Login/registration/password-
// reset HTTP endpoints are a later, real product surface — this module
// currently exposes only the session/password building blocks that
// SessionAuthGuard, PermissionsGuard, and CsrfGuard depend on.
@Module({
  providers: [SessionService, PasswordService],
  exports: [SessionService, PasswordService],
})
export class IdentityModule {}
