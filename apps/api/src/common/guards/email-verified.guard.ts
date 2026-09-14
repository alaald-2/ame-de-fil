import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { REQUIRE_VERIFIED_EMAIL_KEY } from "../decorators/require-verified-email.decorator.ts";

// Runs after SessionAuthGuard/PermissionsGuard, mirroring PermissionsGuard's
// own shape exactly (opt-in metadata, no-op when absent, reads
// request.auth). A route with no @RequireVerifiedEmail() is unaffected; an
// anonymous/guest caller (request.auth undefined — @OptionalAuth() routes
// like checkout stay guest-friendly) always passes, since there's no email
// to have verified yet. A distinct error code (not a generic 401/403) so
// the storefront can branch on it specifically and offer a resend action.
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_VERIFIED_EMAIL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (!request.auth) return true;
    if (request.auth.emailVerifiedAt) return true;

    throw new ForbiddenException({
      error: "EmailNotVerified",
      message: "Please verify your email address before checking out",
    });
  }
}
