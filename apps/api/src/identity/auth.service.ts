import { Injectable, UnauthorizedException } from "@nestjs/common";
import { UserStatus, type User } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";
import { fromPrismaLocale } from "../common/locale.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { PasswordService } from "./password.service.ts";
import { SessionService, type CreatedSession } from "./session.service.ts";
import type { GoogleProfile } from "./google-oauth.provider.ts";
import type { LoginInput } from "./dto/login.dto.ts";
import type { SafeUser } from "./dto/responses.ts";

const GOOGLE_PROVIDER = "google";

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
    const existingUser = await this.prisma.user.findUnique({ where: { email: profile.email } });
    if (existingUser) return existingUser;

    return this.prisma.user.create({
      data: {
        email: profile.email,
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
    };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.passwords.hash(TIMING_PLACEHOLDER_PASSWORD);
    return this.dummyHash;
  }
}
