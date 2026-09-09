import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { Env } from "@ame-de-fil/config";
import { SessionService } from "../../identity/session.service.js";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.js";
import { OPTIONAL_AUTH_KEY } from "../decorators/optional-auth.decorator.js";

// Default-deny: every route requires a valid session unless explicitly
// marked @Public() or @OptionalAuth() (SECURITY.md §2). Runs before
// PermissionsGuard/CsrfGuard, which both depend on request.auth being set
// here (when it's set at all — see @OptionalAuth()).
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const isOptional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    const cookieName = this.config.get("SESSION_COOKIE_NAME", { infer: true });
    const token = (request.cookies as Record<string, string> | undefined)?.[cookieName];

    if (!token) {
      if (isOptional) return true; // anonymous caller — request.auth stays undefined
      throw new UnauthorizedException({ error: "Unauthorized", message: "No session" });
    }

    const auth = await this.sessions.validateSession(token);
    if (!auth) {
      // Deliberately still a hard failure even for @OptionalAuth() routes: a
      // *present but invalid* cookie (expired/revoked/forged) is different
      // from *no cookie at all* — silently treating it as "anonymous" would
      // let a caller retry with a stale cookie and get a confusing mix of
      // "sometimes logged in" behavior instead of a clear signal to log in
      // again or drop the cookie.
      throw new UnauthorizedException({
        error: "Unauthorized",
        message: "Invalid or expired session",
      });
    }

    request.auth = auth;
    return true;
  }
}
