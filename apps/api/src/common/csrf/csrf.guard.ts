import { timingSafeEqual } from "node:crypto";
import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.ts";
import { OPTIONAL_AUTH_KEY } from "../decorators/optional-auth.decorator.ts";
import { SKIP_CSRF_KEY } from "./skip-csrf.decorator.ts";

const CSRF_HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Double-submit token, compared against the value SessionAuthGuard attached
// to request.auth (SECURITY.md §3). SameSite=Lax alone only mitigates
// cross-site top-level navigation, not every vector — this covers the rest.
// Runs after SessionAuthGuard; @Public() routes have no session to protect,
// and @SkipCsrf() is reserved for signature-verified routes (future Stripe
// webhooks), which aren't cookie-authenticated at all.
//
// The anonymous-guest bypass below is gated on the route's own declared
// @OptionalAuth() metadata, not merely on request.auth being undefined.
// request.auth *can* legitimately be undefined on an @OptionalAuth() route
// (cart) for a fully anonymous guest — there is no session cookie there at
// all, only a low-value guest-cart identity cookie, so there is no
// session-bound secret for double-submit to check; SameSite=Lax on that
// cookie already blocks the classic cross-site POST vector, and the worst
// case (a forged same-site request touching someone's anonymous cart) never
// reaches payment/PII. Checking the metadata explicitly — instead of only
// inferring from request.auth's absence — means a future bug (guard
// reordering, a stray undefined on some other code path) can never
// silently exempt a route that actually required authentication: on any
// route without @OptionalAuth()/@Public(), a missing csrfToken now fails
// closed instead of being read as "anonymous, nothing to check."
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || skip) return true;

    const expected = request.auth?.csrfToken;
    if (!expected) {
      const isOptional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      // Bypass only for a *declared* @OptionalAuth() route with no auth at
      // all — never inferred from the absence of a token alone.
      return isOptional === true && request.auth === undefined;
    }

    const provided = request.headers[CSRF_HEADER];
    if (typeof provided !== "string" || provided.length !== expected.length) return false;

    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  }
}
