import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { AccountActionTokenPurpose, Prisma, UserStatus, type User } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";
import { fromPrismaLocale } from "../common/locale.ts";
import { normalizeEmail } from "../common/normalize-email.ts";
import { generateAccountActionToken, hashAccountActionToken } from "../common/account-action-token.ts";
import { generateLoginOtpCode, hashLoginOtpCode } from "../common/login-otp.ts";
import { isUniqueConstraintViolation } from "../checkout/prisma-errors.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { NotificationsService } from "../notifications/notifications.service.ts";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { PasswordService } from "./password.service.ts";
import { SessionService, type CreatedSession } from "./session.service.ts";
import type { GoogleProfile } from "./google-oauth.provider.ts";
import type { LoginInput } from "./dto/login.dto.ts";
import type { RegisterInput } from "./dto/register.dto.ts";
import type { ForgotPasswordInput } from "./dto/forgot-password.dto.ts";
import type { ResetPasswordInput } from "./dto/reset-password.dto.ts";
import type { ResendVerificationInput } from "./dto/resend-verification.dto.ts";
import type { VerifyEmailInput } from "./dto/verify-email.dto.ts";
import type { LoginMethodInput } from "./dto/login-method.dto.ts";
import type { RequestOtpInput } from "./dto/request-otp.dto.ts";
import type { VerifyOtpInput } from "./dto/verify-otp.dto.ts";
import type { LoginMethodResponse, MessageResponse, SafeUser } from "./dto/responses.ts";

const GOOGLE_PROVIDER = "google";

// Generic, identical response for register/resend-verification/
// forgot-password regardless of whether the email existed, was already
// verified, or is Google-only (SECURITY.md §1's enumeration posture,
// extended to the new endpoints) — the caller never sees a different
// outcome to probe with.
const GENERIC_CHECK_EMAIL_MESSAGE = { message: "If an account is eligible, an email has been sent." };
const GENERIC_ACCOUNT_CREATED_MESSAGE = { message: "Check your email to verify your account." };
const GENERIC_PASSWORD_RESET_DONE_MESSAGE = { message: "Your password has been updated." };

// A 400, not a 401 — unlike a login/register failure, the sensitive axis
// here is "does this email exist" (probed via something the attacker
// chooses), not "is this bearer token valid" (something the caller already
// possesses or is guessing) — telling them a token is invalid/expired leaks
// nothing about which account it belonged to (entropy + rate-limiting are
// the real defense against token-guessing, not response vagueness).
const INVALID_OR_EXPIRED_TOKEN = () =>
  new BadRequestException({ error: "InvalidOrExpiredToken", message: "This link is invalid or has expired" });

// A real argon2id hash of a fixed, non-secret placeholder — never a valid
// user's hash, computed once per process and reused. Verifying against
// *something* on every login attempt, whether or not the email exists,
// keeps a nonexistent-email response taking roughly the same time as a
// wrong-password one (SECURITY.md §1: never reveal whether the email
// exists — a real timing gap between "no such user" and "bad password" is
// exactly that kind of leak, just via latency instead of the message text).
const TIMING_PLACEHOLDER_PASSWORD = "ame-de-fil-timing-placeholder";

const INVALID_CREDENTIALS = () =>
  new UnauthorizedException({ error: "InvalidCredentials", message: "Invalid email or password" });

// One generic outcome for "no such user", "no active code", "wrong code",
// "expired code", and "account disabled" alike — the same enumeration
// reasoning as INVALID_OR_EXPIRED_TOKEN, extended to OTP: unlike
// /auth/otp/request (where the sensitive axis is the attacker-chosen email),
// here the attacker also supplies the code itself, so a uniform message
// leaks nothing beyond "that guess was wrong."
const INVALID_OTP = () =>
  new BadRequestException({ error: "InvalidOrExpiredCode", message: "This code is invalid or has expired" });

// A code is meant to be typed within a minute or two of arriving, so 5 wrong
// tries is already generous relative to a 6-digit (1-in-1,000,000) space —
// the real point is capping *any* systematic guessing, not surviving fat-
// fingering. Not env-configurable (like MAX_ORDER_NUMBER_ATTEMPTS in
// checkout.service.ts) — a security invariant, not an ops knob.
const LOGIN_OTP_MAX_ATTEMPTS = 5;

// Enforced server-side (not just a disabled resend button client-side) so a
// client bypassing the UI — or a second tab/device — can't force a fresh
// send on every request; this is also the real defense against spraying a
// victim's inbox from many IPs, which per-IP rate limiting alone can't stop.
const LOGIN_OTP_RESEND_COOLDOWN_MS = 60_000;

export interface LoginContext {
  userAgent?: string;
  ipAddress?: string;
}

export interface LoginResult extends CreatedSession {
  user: SafeUser;
}

@Injectable()
export class AuthService {
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async login(input: LoginInput, context: LoginContext): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const passwordHash = user?.passwordHash ?? (await this.getDummyHash());
    const passwordValid = await this.passwords.verify(passwordHash, input.password);

    // One generic outcome for "no such user", "wrong password", and
    // "account disabled" — a distinct message for the last one would leak
    // exactly the account-existence signal §1 requires never leaking.
    if (!user || !passwordValid || user.status !== UserStatus.ACTIVE) {
      throw INVALID_CREDENTIALS();
    }

    return this.issueSession(user, context);
  }

  // Google has already authenticated this profile by the time this runs
  // (auth.controller.ts's callback only calls this after a successful
  // code/token exchange) — this method's job is entirely "resolve or
  // create the local User", never re-verifying identity itself.
  async loginWithGoogle(profile: GoogleProfile, context: LoginContext): Promise<LoginResult> {
    // Google's own `email_verified` claim, not a guess — an unverified
    // email must never be trusted to auto-link or auto-create an account
    // (the exact account-takeover vector "sign in with any OAuth provider
    // that will vouch for an unverified email" describes).
    if (!profile.emailVerified) {
      throw new UnauthorizedException({
        error: "EmailNotVerified",
        message: "Google account email is not verified",
      });
    }

    const existingAccount = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider: GOOGLE_PROVIDER, providerAccountId: profile.sub } },
      include: { user: true },
    });

    const user = existingAccount ? existingAccount.user : await this.findOrCreateUserForGoogle(profile);

    // Same generic posture as password login (DECISIONS.md ADR-032) — a
    // disabled account must not behave differently via Google than via
    // password, or the difference itself becomes a signal.
    if (user.status !== UserStatus.ACTIVE) throw INVALID_CREDENTIALS();

    if (!existingAccount) {
      // upsert, not create: two concurrent first-time sign-ins for the
      // same Google account would otherwise race a plain create against
      // the @@unique([provider, providerAccountId]) constraint.
      await this.prisma.oAuthAccount.upsert({
        where: { provider_providerAccountId: { provider: GOOGLE_PROVIDER, providerAccountId: profile.sub } },
        create: { userId: user.id, provider: GOOGLE_PROVIDER, providerAccountId: profile.sub },
        update: {},
      });
    }

    return this.issueSession(user, context);
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.revokeSession(sessionId);
  }

  async getSafeUser(auth: AuthContext): Promise<SafeUser> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    return this.toSafeUser(user, auth.permissions);
  }

  // Matches an existing password/other-provider account by email first —
  // safe only because profile.emailVerified was already checked by the
  // caller: Google itself vouching for ownership of that address is what
  // makes linking-by-email non-guessable, not a coincidence of matching
  // strings. Creates a brand-new User (no passwordHash — schema allows
  // this since DECISIONS.md ADR-033) only when no User for this email
  // exists at all. Never links the OAuthAccount itself — the caller
  // (loginWithGoogle) does that uniformly for both the found-by-email and
  // just-created cases, so there is exactly one code path that does it.
  private async findOrCreateUserForGoogle(profile: GoogleProfile): Promise<User> {
    const email = normalizeEmail(profile.email);
    const existingUser = await this.prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      // Account-takeover fix: self-service password registration means an
      // attacker can register someone else's email address with a password
      // *they* control. If nobody has ever proven ownership of this row's
      // email (emailVerifiedAt still null — a legitimate not-yet-verified
      // signup or a squatted one, indistinguishable from here), Google's
      // verified-email claim is stronger evidence than an unproven password
      // claim on the same address and must win: null out any password
      // (killing a squatter's access outright) and revoke any sessions,
      // atomically with marking the email verified. An already-verified row
      // is left untouched — ownership there is already proven, so this is
      // just an additional login method being linked.
      if (existingUser.emailVerifiedAt === null) {
        return this.prisma.$transaction(async (tx) => {
          await this.sessions.revokeAllSessionsForUser(existingUser.id, tx);
          return tx.user.update({
            where: { id: existingUser.id },
            data: { passwordHash: null, emailVerifiedAt: new Date() },
          });
        });
      }
      return existingUser;
    }

    return this.prisma.user.create({
      data: {
        email,
        passwordHash: null,
        firstName: profile.givenName,
        lastName: profile.familyName,
        emailVerifiedAt: new Date(),
      },
    });
  }

  private async issueSession(user: User, context: LoginContext): Promise<LoginResult> {
    const session = await this.sessions.createSession({
      userId: user.id,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
    });

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    // Re-resolves via the session that was just created rather than
    // re-deriving the role -> permission flattening here too — reuses
    // SessionService.validateSession's existing query instead of
    // duplicating it (login is not a hot path; one extra read is cheap
    // next to the argon2 hashing already done above).
    const auth = await this.sessions.validateSession(session.token);
    /* istanbul ignore next -- session was just created; this is defensive only */
    if (!auth) throw INVALID_CREDENTIALS();

    return { ...session, user: this.toSafeUser(user, auth.permissions) };
  }

  private toSafeUser(user: User, permissions: readonly string[]): SafeUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      locale: fromPrismaLocale(user.locale),
      permissions: [...permissions],
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.passwords.hash(TIMING_PLACEHOLDER_PASSWORD);
    return this.dummyHash;
  }

  // Enumeration-safe (SECURITY.md §1, extended): if the email already has a
  // User row, nothing is created/modified and no email is sent, but the
  // submitted password is still hashed-and-discarded on that branch purely
  // for timing parity with the real-creation branch — a measurable timing
  // gap between "new account" and "already existed" would itself be the
  // leak. Never auto-logs-in (no session/cookie on success) for the same
  // reason: a present-or-absent session cookie would be its own
  // distinguishable signal a response message alone can't hide, so the
  // customer logs in explicitly afterward via the already-safe /auth/login.
  async register(input: RegisterInput): Promise<MessageResponse> {
    const existingUser = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existingUser) {
      await this.passwords.hash(input.password);
      return GENERIC_ACCOUNT_CREATED_MESSAGE;
    }

    const passwordHash = await this.passwords.hash(input.password);
    const ttlHours = this.config.get("EMAIL_VERIFICATION_TOKEN_TTL_HOURS", { infer: true });

    let created: { userId: string; plaintextToken: string } | null;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
          },
        });
        const token = await this.issueAccountActionToken(
          tx,
          user.id,
          AccountActionTokenPurpose.EMAIL_VERIFICATION,
          ttlHours,
        );
        return { userId: user.id, plaintextToken: token };
      });
    } catch (error) {
      // Lost a genuine concurrent race for this exact email: the initial
      // findUnique above found nothing, but another request's registration
      // committed first in between. Same enumeration-safe no-op response as
      // the existingUser branch above — never a raw 500 from an unhandled
      // constraint violation (mirrors checkout.service.ts's own handling of
      // its own concurrent-insert races).
      if (isUniqueConstraintViolation(error, "User", "email")) {
        return GENERIC_ACCOUNT_CREATED_MESSAGE;
      }
      throw error;
    }

    // Post-commit, never inside the transaction (DECISIONS.md ADR-031) —
    // never rethrows, so a slow/failed send can never undo the account that
    // was just created.
    await this.notifications.sendVerificationEmail(created.userId, created.plaintextToken);

    return GENERIC_ACCOUNT_CREATED_MESSAGE;
  }

  async verifyEmail(input: VerifyEmailInput): Promise<MessageResponse> {
    const userId = await this.consumeAccountActionToken(
      input.token,
      AccountActionTokenPurpose.EMAIL_VERIFICATION,
    );
    if (!userId) throw INVALID_OR_EXPIRED_TOKEN();

    await this.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    return { message: "Your email address has been verified." };
  }

  // Enumeration-safe: identical response whether the email doesn't exist,
  // is already verified, is disabled, or is Google-only — only a real,
  // eligible (unverified, ACTIVE) password account ever actually gets an
  // email.
  async resendVerification(input: ResendVerificationInput): Promise<MessageResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });

    if (user && user.status === UserStatus.ACTIVE && user.emailVerifiedAt === null) {
      const ttlHours = this.config.get("EMAIL_VERIFICATION_TOKEN_TTL_HOURS", { infer: true });
      const plaintextToken = await this.prisma.$transaction((tx) =>
        this.issueAccountActionToken(tx, user.id, AccountActionTokenPurpose.EMAIL_VERIFICATION, ttlHours),
      );
      await this.notifications.sendVerificationEmail(user.id, plaintextToken);
    }

    return GENERIC_CHECK_EMAIL_MESSAGE;
  }

  // Enumeration-safe, same posture as resendVerification. A Google-only
  // account (passwordHash null) silently gets no reset email either — never
  // revealing *how* an account authenticates is worth more here than the
  // (rare) UX cost to a customer who forgot they signed up via Google.
  async requestPasswordReset(input: ForgotPasswordInput): Promise<MessageResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });

    if (user && user.status === UserStatus.ACTIVE && user.passwordHash !== null) {
      const ttlHours = this.config.get("PASSWORD_RESET_TOKEN_TTL_HOURS", { infer: true });
      const plaintextToken = await this.prisma.$transaction((tx) =>
        this.issueAccountActionToken(tx, user.id, AccountActionTokenPurpose.PASSWORD_RESET, ttlHours),
      );
      await this.notifications.sendPasswordResetEmail(user.id, plaintextToken);
    }

    return GENERIC_CHECK_EMAIL_MESSAGE;
  }

  async resetPassword(input: ResetPasswordInput): Promise<MessageResponse> {
    // Token consumed (and rejected) before the expensive hash — an invalid/
    // expired token is an honest, specific error regardless of the
    // submitted password, so there's nothing to lose by checking it first.
    const userId = await this.consumeAccountActionToken(input.token, AccountActionTokenPurpose.PASSWORD_RESET);
    if (!userId) throw INVALID_OR_EXPIRED_TOKEN();

    const passwordHash = await this.passwords.hash(input.password);

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          // A successful reset via an emailed token is equally strong proof
          // of email ownership as a verify-email click — free unblock of
          // checkout for a not-yet-verified customer, at no extra cost.
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        },
      });
      // Reuses the existing method as-is (SessionService) — no new
      // session-service method needed.
      await this.sessions.revokeAllSessionsForUser(userId, tx);
    });

    return GENERIC_PASSWORD_RESET_DONE_MESSAGE;
  }

  // Pure UI-branching hint for the storefront's email-first login screen
  // (DECISIONS.md ADR-036) — no side effects, nothing sent, no timing-
  // sensitive dummy work needed (unlike login()'s dummy-hash): the
  // deliberately accepted trade-off here is a single bit ("does this email
  // have a password"), not "does this email exist at all" — a Google-only
  // account and a wholly unknown email both get "otp" alike.
  async getLoginMethod(input: LoginMethodInput): Promise<LoginMethodResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { passwordHash: true },
    });
    return { method: user?.passwordHash ? "password" : "otp" };
  }

  // Enumeration-safe, same posture as resendVerification/requestPasswordReset:
  // identical generic response whether the email doesn't exist, is disabled,
  // or is mid-cooldown. A Google-only account IS eligible here (unlike
  // password reset) — their email is already verified via Google, so an
  // email-OTP is equally strong proof of ownership, and this is meant to work
  // as a real alternative login method for them, not just a password-account
  // fallback.
  async requestLoginOtp(input: RequestOtpInput): Promise<MessageResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });

    if (user && user.status === UserStatus.ACTIVE) {
      const recentlyIssued = await this.prisma.loginOtp.findFirst({
        where: {
          userId: user.id,
          consumedAt: null,
          createdAt: { gt: new Date(Date.now() - LOGIN_OTP_RESEND_COOLDOWN_MS) },
        },
        select: { id: true },
      });

      // Still within cooldown — silently no-op (no second email), but the
      // response must stay identical either way: a distinct "please wait"
      // reply would itself confirm the email is a real, active account.
      if (!recentlyIssued) {
        const ttlMinutes = this.config.get("LOGIN_OTP_TTL_MINUTES", { infer: true });
        const code = await this.prisma.$transaction((tx) => this.issueLoginOtp(tx, user.id, ttlMinutes));
        await this.notifications.sendLoginOtpEmail(user.id, code);
      }
    }

    return GENERIC_CHECK_EMAIL_MESSAGE;
  }

  async loginWithOtp(input: VerifyOtpInput, context: LoginContext): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || user.status !== UserStatus.ACTIVE) throw INVALID_OTP();

    const otp = await this.prisma.loginOtp.findFirst({
      where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) throw INVALID_OTP();

    if (otp.codeHash !== hashLoginOtpCode(input.code)) {
      // `increment` is a single atomic SQL `attempts = attempts + 1` —
      // race-safe against concurrent wrong guesses on its own, no
      // read-modify-write in application code.
      const updated = await this.prisma.loginOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      if (updated.attempts >= LOGIN_OTP_MAX_ATTEMPTS) {
        await this.prisma.loginOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
      }
      throw INVALID_OTP();
    }

    // Race-safe consumption, same idiom as consumeAccountActionToken: only
    // the caller that wins this conditional UPDATE proceeds to issue a
    // session — a concurrent second verify of the same correct code can
    // never also succeed.
    const consumed = await this.prisma.loginOtp.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw INVALID_OTP();

    // A correct email-OTP is equally strong proof of ownership as a
    // verify-email click or a password reset via emailed token — same free
    // unblock-of-checkout bonus resetPassword already gives. Uses update()'s
    // own return value (the fresh row), not the stale in-memory `user` —
    // issueSession/toSafeUser would otherwise report emailVerifiedAt: null
    // in the very response that just set it.
    const effectiveUser =
      user.emailVerifiedAt === null
        ? await this.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } })
        : user;

    return this.issueSession(effectiveUser, context);
  }

  // Invalidates any prior unconsumed OTP for this user before issuing a new
  // one (same updateMany-then-create idiom issueAccountActionToken already
  // uses) — one active code per user at a time, so there's never ambiguity
  // about which code is "the" current one.
  private async issueLoginOtp(
    tx: Prisma.TransactionClient,
    userId: string,
    ttlMinutes: number,
  ): Promise<string> {
    const code = generateLoginOtpCode();
    const codeHash = hashLoginOtpCode(code);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await tx.loginOtp.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: new Date() } });
    await tx.loginOtp.create({ data: { userId, codeHash, expiresAt } });

    return code;
  }

  // Invalidates any prior unconsumed token of the same purpose before
  // issuing a new one (same updateMany-then-create idiom as
  // SessionService.revokeSession) — a customer who requests a second reset
  // email can't have two simultaneously-valid tokens outstanding.
  private async issueAccountActionToken(
    tx: Prisma.TransactionClient,
    userId: string,
    purpose: AccountActionTokenPurpose,
    ttlHours: number,
  ): Promise<string> {
    const plaintextToken = generateAccountActionToken();
    const tokenHash = hashAccountActionToken(plaintextToken);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await tx.accountActionToken.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await tx.accountActionToken.create({ data: { userId, purpose, tokenHash, expiresAt } });

    return plaintextToken;
  }

  // Race-safe: the conditional UPDATE (`consumedAt IS NULL AND
  // expiresAt > now()`) can succeed for at most one concurrent caller —
  // `tokenHash` is unique, so two simultaneous consumption attempts for the
  // same token can never both report count === 1.
  private async consumeAccountActionToken(
    plaintextToken: string,
    purpose: AccountActionTokenPurpose,
  ): Promise<string | null> {
    const tokenHash = hashAccountActionToken(plaintextToken);
    const result = await this.prisma.accountActionToken.updateMany({
      where: { tokenHash, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (result.count !== 1) return null;

    const token = await this.prisma.accountActionToken.findUnique({
      where: { tokenHash },
      select: { userId: true },
    });
    return token?.userId ?? null;
  }
}
