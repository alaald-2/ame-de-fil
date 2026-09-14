import { timingSafeEqual } from "node:crypto";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiExcludeEndpoint, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
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
import { GOOGLE_OAUTH_PROVIDER, type GoogleOAuthProvider } from "./google-oauth.provider.ts";
import { loginSchema, type LoginInput } from "./dto/login.dto.ts";
import { loginMethodSchema, type LoginMethodInput } from "./dto/login-method.dto.ts";
import { requestOtpSchema, type RequestOtpInput } from "./dto/request-otp.dto.ts";
import { verifyOtpSchema, type VerifyOtpInput } from "./dto/verify-otp.dto.ts";
import { registerSchema, type RegisterInput } from "./dto/register.dto.ts";
import { verifyEmailSchema, type VerifyEmailInput } from "./dto/verify-email.dto.ts";
import { resendVerificationSchema, type ResendVerificationInput } from "./dto/resend-verification.dto.ts";
import { forgotPasswordSchema, type ForgotPasswordInput } from "./dto/forgot-password.dto.ts";
import { resetPasswordSchema, type ResetPasswordInput } from "./dto/reset-password.dto.ts";
import {
  loginResponseSchema,
  loginMethodResponseSchema,
  messageResponseSchema,
  sessionResponseSchema,
  type LoginMethodResponse,
  type MessageResponse,
  type SessionResponse,
} from "./dto/responses.ts";

// Ephemeral, single-use cookies scoped to one Google round-trip only — not
// product-facing, not env-configurable (unlike SESSION_COOKIE_NAME/
// CSRF_COOKIE_NAME), the same way CsrfGuard's own X-CSRF-Token header name
// is a hardcoded constant rather than a config knob.
const OAUTH_STATE_COOKIE = "ame_oauth_state";
const OAUTH_PKCE_COOKIE = "ame_oauth_pkce";
const OAUTH_FLOW_MAX_AGE_MS = 10 * 60 * 1000;

function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// The real auth entry point (ROADMAP.md Phase 4, DECISIONS.md ADR-032) —
// login/logout/session issuance on top of the pre-existing SessionService/
// PasswordService (ADR-015), self-service password registration +
// email-verification + password-reset (a later ADR), and Google sign-in
// (ADR-033) — a first-time Google sign-in creates a User with no password
// at all, since that's what "Sign in with Google" means for a real
// customer.
@ApiTags("auth")
@ApiCookieAuth("ame_session")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
    @Inject(GOOGLE_OAUTH_PROVIDER) private readonly googleOAuth: GoogleOAuthProvider,
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

  // @Public() — no side effects, nothing sent; pure UI-branching hint for
  // the storefront's email-first login screen (DECISIONS.md ADR-036). Rate-
  // limited a bit more loosely than the send/verify endpoints below since
  // it's a read-only lookup a customer might legitimately retry after a
  // typo, but still capped — it's a real (bounded) account-state oracle,
  // never left uncapped.
  @Public()
  @Post("login-method")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ windowMs: 60_000, max: 20 })
  @ApiOperation({ summary: "Which credential this email uses next — password or a one-time code" })
  @ApiBody({ schema: toOpenApiSchema(loginMethodSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(loginMethodResponseSchema) })
  @ApiErrorResponses(400, 429)
  async loginMethod(
    @Body(new ZodValidationPipe(loginMethodSchema)) body: LoginMethodInput,
  ): Promise<LoginMethodResponse> {
    return this.auth.getLoginMethod(body);
  }

  // @Public() — enumeration-safe, same generic response regardless of
  // account existence/state (mirrors forgot-password exactly). A Google-
  // only account IS eligible (unlike password reset) — AuthService's own
  // comment explains why.
  @Public()
  @Post("otp/request")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ windowMs: 60_000, max: 5 })
  @ApiOperation({ summary: "Email a one-time sign-in code — always returns the same generic response" })
  @ApiBody({ schema: toOpenApiSchema(requestOtpSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(messageResponseSchema) })
  @ApiErrorResponses(400, 429)
  async requestOtp(
    @Body(new ZodValidationPipe(requestOtpSchema)) body: RequestOtpInput,
  ): Promise<MessageResponse> {
    return this.auth.requestLoginOtp(body);
  }

  // @Public() — no session exists yet (the whole point of logging in).
  // Looser rate limit than the other /auth/* write endpoints — the code's
  // own attempts counter (AuthService.LOGIN_OTP_MAX_ATTEMPTS) is the primary
  // defense against guessing, this is the secondary layer.
  @Public()
  @Post("otp/verify")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ windowMs: 60_000, max: 10 })
  @ApiOperation({ summary: "Consume a one-time sign-in code, issuing a session cookie" })
  @ApiBody({ schema: toOpenApiSchema(verifyOtpSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(loginResponseSchema) })
  @ApiErrorResponses(400, 429)
  async verifyOtp(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body(new ZodValidationPipe(verifyOtpSchema)) body: VerifyOtpInput,
  ) {
    const result = await this.auth.loginWithOtp(body, {
      userAgent: request.get("user-agent"),
      ipAddress: request.ip,
    });
    this.setSessionCookies(response, result);
    return { user: result.user, csrfToken: result.csrfToken };
  }

  // @Public() — no session exists yet. Enumeration-safe and never
  // auto-logs-in (AuthService.register's own comment explains why) — always
  // the same 201 body, whether or not the email already had an account.
  @Public()
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ windowMs: 60_000, max: 5 })
  @ApiOperation({ summary: "Create a password account — always returns the same generic response" })
  @ApiBody({ schema: toOpenApiSchema(registerSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(messageResponseSchema) })
  @ApiErrorResponses(400, 429)
  async register(@Body(new ZodValidationPipe(registerSchema)) body: RegisterInput): Promise<MessageResponse> {
    return this.auth.register(body);
  }

  // POST, not GET — this is reached via client-side JS on a storefront page
  // the email links to (never a direct browser navigation), specifically to
  // avoid the classic failure mode where an email security scanner GETs the
  // link first and burns the single-use token before the real user clicks
  // it. @Public() — no session exists yet.
  @Public()
  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Consume an email-verification token" })
  @ApiBody({ schema: toOpenApiSchema(verifyEmailSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(messageResponseSchema) })
  @ApiErrorResponses(400)
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput,
  ): Promise<MessageResponse> {
    return this.auth.verifyEmail(body);
  }

  // @Public() — enumeration-safe, same generic response regardless of
  // whether the email exists, is already verified, or is Google-only.
  @Public()
  @Post("resend-verification")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ windowMs: 60_000, max: 5 })
  @ApiOperation({ summary: "Resend the email-verification link — always returns the same generic response" })
  @ApiBody({ schema: toOpenApiSchema(resendVerificationSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(messageResponseSchema) })
  @ApiErrorResponses(400, 429)
  async resendVerification(
    @Body(new ZodValidationPipe(resendVerificationSchema)) body: ResendVerificationInput,
  ): Promise<MessageResponse> {
    return this.auth.resendVerification(body);
  }

  // @Public() — enumeration-safe, same generic response regardless of
  // account existence/state (SECURITY.md §1, extended to this endpoint).
  @Public()
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ windowMs: 60_000, max: 5 })
  @ApiOperation({ summary: "Request a password-reset email — always returns the same generic response" })
  @ApiBody({ schema: toOpenApiSchema(forgotPasswordSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(messageResponseSchema) })
  @ApiErrorResponses(400, 429)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
  ): Promise<MessageResponse> {
    return this.auth.requestPasswordReset(body);
  }

  // POST, not GET — same reasoning as verify-email above. @Public(): the
  // caller has no session yet (the whole point of a password reset).
  // InvalidOrExpiredToken (400) is a deliberately honest, specific error
  // here — unlike login/register, the sensitive axis is a possessed bearer
  // token, not a guessable email address (AuthService's own comment).
  @Public()
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ windowMs: 60_000, max: 5 })
  @ApiOperation({ summary: "Consume a password-reset token and set a new password" })
  @ApiBody({ schema: toOpenApiSchema(resetPasswordSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(messageResponseSchema) })
  @ApiErrorResponses(400, 429)
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
  ): Promise<MessageResponse> {
    return this.auth.resetPassword(body);
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

  // @Public() — same reasoning as /login: no session exists yet. Not
  // rate-limited like /login is (SECURITY.md §4's explicit list names
  // credential-guessing endpoints specifically; this one takes no
  // credentials at all, only redirects, so there is no brute-forceable
  // surface here the way a password field is one). Excluded from the
  // generated OpenAPI document — a browser-navigated redirect endpoint,
  // never called by a JSON API client.
  @Public()
  @Get("google")
  @ApiExcludeEndpoint()
  async googleLogin(@Res({ passthrough: true }) response: Response): Promise<void> {
    if (!this.storefrontBaseUrl()) {
      throw new ServiceUnavailableException({
        error: "OAuthNotConfigured",
        message: "Google sign-in is not configured",
      });
    }

    // Throws (PendingOAuthProvider) if Google itself isn't configured —
    // propagates as a normal 503 via AllExceptionsFilter, since nothing
    // has been written to `response` yet at this point.
    const { url, state, codeVerifier } = this.googleOAuth.createAuthorizationRequest();
    const secure = this.isSecureEnv();

    response.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: OAUTH_FLOW_MAX_AGE_MS,
    });
    response.cookie(OAUTH_PKCE_COOKIE, codeVerifier, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: OAUTH_FLOW_MAX_AGE_MS,
    });
    response.redirect(url);
  }

  // @Public() — Google redirects the browser here with no session cookie
  // of ours attached. Every failure path redirects back to the storefront
  // with a fixed, code-controlled `authError` reason rather than throwing
  // — this is a top-level browser navigation, not an XHR call, so a raw
  // JSON error response would render as a broken page instead of
  // something the storefront can actually show the customer. Google's own
  // `error` query value is deliberately never echoed into the redirect
  // (only ever one of this file's own fixed reason strings) — passing
  // arbitrary external input into a Location header is exactly the kind
  // of thing that turns into an injection bug.
  @Public()
  @Get("google/callback")
  @ApiExcludeEndpoint()
  async googleCallback(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Query("code") code: unknown,
    @Query("state") stateParam: unknown,
    @Query("error") googleError: unknown,
  ): Promise<void> {
    const storefrontBaseUrl = this.storefrontBaseUrl() ?? "/";
    const cookies = request.cookies as Record<string, string> | undefined;
    const cookieState = cookies?.[OAUTH_STATE_COOKIE];
    const codeVerifier = cookies?.[OAUTH_PKCE_COOKIE];
    this.clearOAuthFlowCookies(response);

    const fail = (reason: string): void => {
      response.redirect(`${storefrontBaseUrl}?authError=${reason}`);
    };

    if (googleError) return fail("google_denied");
    if (typeof code !== "string" || typeof stateParam !== "string" || !cookieState || !codeVerifier) {
      return fail("invalid_request");
    }
    if (!timingSafeEqualStrings(stateParam, cookieState)) return fail("state_mismatch");

    try {
      const profile = await this.googleOAuth.exchangeCodeForProfile(code, codeVerifier);
      const result = await this.auth.loginWithGoogle(profile, {
        userAgent: request.get("user-agent"),
        ipAddress: request.ip,
      });
      this.setSessionCookies(response, result);
      response.redirect(storefrontBaseUrl);
    } catch {
      // Deliberately one generic reason for every failure past this point
      // (email not verified, Google API error, disabled account) — the
      // same "don't let the failure mode itself leak a signal" posture as
      // AuthService.login's identical InvalidCredentials for every
      // password-login failure reason.
      fail("oauth_failed");
    }
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

  private storefrontBaseUrl(): string | undefined {
    return this.config.get("STOREFRONT_BASE_URL", { infer: true });
  }

  private clearOAuthFlowCookies(response: Response): void {
    const secure = this.isSecureEnv();
    response.clearCookie(OAUTH_STATE_COOKIE, { httpOnly: true, sameSite: "lax", secure });
    response.clearCookie(OAUTH_PKCE_COOKIE, { httpOnly: true, sameSite: "lax", secure });
  }
}
