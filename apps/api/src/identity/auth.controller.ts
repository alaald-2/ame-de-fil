import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import type { Env } from "@ame-de-fil/config";
import { Public } from "../common/decorators/public.decorator.ts";
import { OptionalAuth } from "../common/decorators/optional-auth.decorator.ts";
import { CurrentUser } from "../common/decorators/current-user.decorator.ts";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { toOpenApiSchema } from "../common/zod-openapi.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { AuthService, type LoginResult } from "./auth.service.ts";
import { loginSchema, type LoginInput } from "./dto/login.dto.ts";
import { loginResponseSchema, sessionResponseSchema, type SessionResponse } from "./dto/responses.ts";

// The real auth entry point (ROADMAP.md Phase 4, DECISIONS.md ADR-032) —
// login/logout/session issuance on top of the pre-existing SessionService/
// PasswordService (ADR-015). Deliberately not "auth" for registration too:
// there is no registration endpoint yet (out of scope here, tracked
// separately) — this controller only ever authenticates a User row that
// already exists.
@ApiTags("auth")
@ApiCookieAuth("ame_session")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // @Public() — the caller has no session yet; that's the entire point of
  // this endpoint. CsrfGuard's double-submit check is bypassed the same
  // way (isPublic short-circuits it) — correctly so, since there is no
  // existing session to bind a CSRF token against yet. Rate-limited per-IP
  // (SECURITY.md §4's explicit list names login first) — 5 attempts/minute
  // is deliberately strict; this is a login form, not a polling endpoint.
  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ windowMs: 60_000, max: 5 })
  @ApiOperation({ summary: "Authenticate with email/password, issuing a session cookie" })
  @ApiBody({ schema: toOpenApiSchema(loginSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(loginResponseSchema) })
  @ApiErrorResponses(400, 401, 429)
  async login(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
  ) {
    const result = await this.auth.login(body, {
      userAgent: request.get("user-agent"),
      ipAddress: request.ip,
    });
    this.setSessionCookies(response, result);
    return { user: result.user, csrfToken: result.csrfToken };
  }

  // No @Public()/@OptionalAuth() — logging out requires an actual session
  // to invalidate, same default-deny posture as every other state-changing
  // route, and (unlike login) CsrfGuard's double-submit check applies in
  // full here: a caller with a valid session cookie but no/wrong
  // X-CSRF-Token header is rejected before this handler ever runs.
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Invalidate the caller's current session" })
  @ApiErrorResponses(401, 403)
  async logout(@CurrentUser() auth: AuthContext, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(auth.sessionId);
    this.clearSessionCookies(response);
  }

  // @OptionalAuth() — must work for both an anonymous caller (no cookie at
  // all -> { authenticated: false }) and a signed-in one, without ever
  // rejecting the request outright the way a default-deny route would.
  // A *present but invalid* cookie still hits SessionAuthGuard's existing
  // hard-failure path (401) — deliberately not folded into
  // { authenticated: false } here (session-auth.guard.ts's own comment
  // explains why: a stale/forged cookie is a different situation from no
  // cookie at all, and deserves a clear "log in again" signal).
  @Get("session")
  @OptionalAuth()
  @ApiOperation({ summary: "The caller's own current session, or { authenticated: false }" })
  @ApiOkResponse({ schema: toOpenApiSchema(sessionResponseSchema) })
  @ApiErrorResponses(401)
  async getSession(@CurrentUser() auth: AuthContext | undefined): Promise<SessionResponse> {
    if (!auth) return { authenticated: false };
    const user = await this.auth.getSafeUser(auth);
    return { authenticated: true, user, csrfToken: auth.csrfToken };
  }

  // Sets both the httpOnly session cookie and a *readable* (non-httpOnly)
  // CSRF cookie alongside it — SECURITY.md §3 calls for the CSRF token to
  // be "issued on session creation"; a cookie is what actually delivers it
  // to browser-side JS without a client having to know to call
  // GET /auth/session first just to get a token to put in its next header.
  // It is deliberately not secret (double-submit tokens never are — only
  // unguessable and bound to the session, which httpOnly session cookie +
  // server-side comparison already ensures), so being JS-readable is safe.
  private setSessionCookies(response: Response, session: LoginResult): void {
    const secure = this.isSecureEnv();
    const maxAge = session.expiresAt.getTime() - Date.now();

    response.cookie(this.sessionCookieName(), session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge,
    });
    response.cookie(this.csrfCookieName(), session.csrfToken, {
      httpOnly: false,
      sameSite: "lax",
      secure,
      maxAge,
    });
  }

  private clearSessionCookies(response: Response): void {
    const secure = this.isSecureEnv();
    response.clearCookie(this.sessionCookieName(), { httpOnly: true, sameSite: "lax", secure });
    response.clearCookie(this.csrfCookieName(), { httpOnly: false, sameSite: "lax", secure });
  }

  private sessionCookieName(): string {
    return this.config.get("SESSION_COOKIE_NAME", { infer: true });
  }

  private csrfCookieName(): string {
    return this.config.get("CSRF_COOKIE_NAME", { infer: true });
  }

  private isSecureEnv(): boolean {
    return this.config.get("NODE_ENV", { infer: true }) === "production";
  }
}
