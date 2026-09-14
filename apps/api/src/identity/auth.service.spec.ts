import { describe, expect, it, vi, beforeEach } from "vitest";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { AccountActionTokenPurpose, Locale, Prisma, UserStatus } from "@ame-de-fil/database";
import { AuthService } from "./auth.service.ts";
import { hashLoginOtpCode } from "../common/login-otp.ts";
import type { PrismaService } from "../database/prisma.service.ts";
import type { PasswordService } from "./password.service.ts";
import type { SessionService } from "./session.service.ts";
import type { NotificationsService } from "../notifications/notifications.service.ts";

const USER = {
  id: "user-1",
  email: "customer@example.com",
  passwordHash: "real-hash",
  firstName: "Test",
  lastName: "Testsson",
  locale: Locale.sv_SE,
  status: UserStatus.ACTIVE,
  emailVerifiedAt: null as Date | null,
};

const AUTH_CONTEXT = {
  userId: "user-1",
  sessionId: "session-token",
  csrfToken: "csrf-token",
  permissions: ["orders.fulfill"],
};

const TTL_HOURS: Record<string, number> = {
  EMAIL_VERIFICATION_TOKEN_TTL_HOURS: 24,
  PASSWORD_RESET_TOKEN_TTL_HOURS: 1,
  LOGIN_OTP_TTL_MINUTES: 10,
};

// $transaction runs its callback against the *same* mocked prisma object —
// every tx.foo.bar() call inside a transaction routes through the exact
// mocks a test already configured on `prisma` itself, so a test doesn't
// need to know or care whether a given AuthService method happens to wrap
// its writes in a transaction.
function makePrismaMock(overrides: Record<string, unknown> = {}) {
  const prisma: Record<string, unknown> = {
    user: {
      findUnique: vi.fn().mockResolvedValue(USER),
      findUniqueOrThrow: vi.fn().mockResolvedValue(USER),
      update: vi.fn().mockResolvedValue(USER),
      create: vi.fn().mockResolvedValue({ ...USER, id: "user-new" }),
    },
    oAuthAccount: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    accountActionToken: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue({ userId: "user-1" }),
    },
    loginOtp: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({ attempts: 1 }),
      create: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
  prisma["$transaction"] = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));

  return prisma as unknown as PrismaService & {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    oAuthAccount: {
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
    accountActionToken: {
      updateMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
    loginOtp: {
      findFirst: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
}

function makePasswordsMock(verifyResult = true) {
  return {
    hash: vi.fn().mockResolvedValue("dummy-hash"),
    verify: vi.fn().mockResolvedValue(verifyResult),
  } as unknown as PasswordService & { hash: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> };
}

function makeSessionsMock() {
  return {
    createSession: vi.fn().mockResolvedValue({
      token: "session-token",
      csrfToken: "csrf-token",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    }),
    validateSession: vi.fn().mockResolvedValue(AUTH_CONTEXT),
    revokeSession: vi.fn().mockResolvedValue(undefined),
    revokeAllSessionsForUser: vi.fn().mockResolvedValue(undefined),
  } as unknown as SessionService & {
    createSession: ReturnType<typeof vi.fn>;
    validateSession: ReturnType<typeof vi.fn>;
    revokeSession: ReturnType<typeof vi.fn>;
    revokeAllSessionsForUser: ReturnType<typeof vi.fn>;
  };
}

function makeNotificationsMock() {
  return {
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    sendLoginOtpEmail: vi.fn().mockResolvedValue(undefined),
  } as unknown as NotificationsService & {
    sendVerificationEmail: ReturnType<typeof vi.fn>;
    sendPasswordResetEmail: ReturnType<typeof vi.fn>;
    sendLoginOtpEmail: ReturnType<typeof vi.fn>;
  };
}

function makeConfigMock(): ConfigService<Env, true> {
  return { get: (key: string) => TTL_HOURS[key] } as unknown as ConfigService<Env, true>;
}

function makeService(overrides: {
  prisma?: ReturnType<typeof makePrismaMock>;
  passwords?: ReturnType<typeof makePasswordsMock>;
  sessions?: ReturnType<typeof makeSessionsMock>;
  notifications?: ReturnType<typeof makeNotificationsMock>;
} = {}) {
  return new AuthService(
    overrides.prisma ?? makePrismaMock(),
    overrides.passwords ?? makePasswordsMock(),
    overrides.sessions ?? makeSessionsMock(),
    overrides.notifications ?? makeNotificationsMock(),
    makeConfigMock(),
  );
}

describe("AuthService.login", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let passwords: ReturnType<typeof makePasswordsMock>;
  let sessions: ReturnType<typeof makeSessionsMock>;
  let service: AuthService;

  beforeEach(() => {
    prisma = makePrismaMock();
    passwords = makePasswordsMock(true);
    sessions = makeSessionsMock();
    service = makeService({ prisma, passwords, sessions });
  });

  it("creates a session and returns a safe user (no passwordHash) on valid credentials", async () => {
    const result = await service.login(
      { email: "customer@example.com", password: "correct-password" },
      { userAgent: "vitest", ipAddress: "127.0.0.1" },
    );

    expect(sessions.createSession).toHaveBeenCalledWith({
      userId: "user-1",
      userAgent: "vitest",
      ipAddress: "127.0.0.1",
    });
    expect(result.token).toBe("session-token");
    expect(result.csrfToken).toBe("csrf-token");
    expect(result.user).toEqual({
      id: "user-1",
      email: "customer@example.com",
      firstName: "Test",
      lastName: "Testsson",
      locale: "sv-SE",
      permissions: ["orders.fulfill"],
      emailVerifiedAt: null,
    });
    expect(result.user).not.toHaveProperty("passwordHash");
  });

  it("returns emailVerifiedAt as an ISO string when the user has verified their email", async () => {
    const verifiedAt = new Date("2026-01-01T00:00:00.000Z");
    prisma.user.findUnique.mockResolvedValue({ ...USER, emailVerifiedAt: verifiedAt });

    const result = await service.login(
      { email: "customer@example.com", password: "correct-password" },
      {},
    );

    expect(result.user.emailVerifiedAt).toBe(verifiedAt.toISOString());
  });

  it("updates lastLoginAt on successful login", async () => {
    await service.login({ email: "customer@example.com", password: "correct-password" }, {});

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { lastLoginAt: expect.any(Date) },
    });
  });

  it("rejects with a generic error on a wrong password, without creating a session", async () => {
    passwords.verify.mockResolvedValue(false);

    await expect(
      service.login({ email: "customer@example.com", password: "wrong" }, {}),
    ).rejects.toThrow(UnauthorizedException);
    expect(sessions.createSession).not.toHaveBeenCalled();
  });

  it("rejects with the exact same generic error for a nonexistent email — never revealing account existence", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    let nonexistentError: unknown;
    try {
      await service.login({ email: "nobody@example.com", password: "anything" }, {});
    } catch (error) {
      nonexistentError = error;
    }

    let wrongPasswordError: unknown;
    passwords.verify.mockResolvedValue(false);
    try {
      await service.login({ email: "customer@example.com", password: "wrong" }, {});
    } catch (error) {
      wrongPasswordError = error;
    }

    expect(nonexistentError).toBeInstanceOf(UnauthorizedException);
    expect(wrongPasswordError).toBeInstanceOf(UnauthorizedException);
    expect((nonexistentError as UnauthorizedException).getResponse()).toEqual(
      (wrongPasswordError as UnauthorizedException).getResponse(),
    );
    expect(sessions.createSession).not.toHaveBeenCalled();
  });

  it("still calls passwords.verify against a real (dummy) hash for a nonexistent email — timing-safe, not short-circuited", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.login({ email: "nobody@example.com", password: "anything" }, {})).rejects.toThrow(
      UnauthorizedException,
    );

    expect(passwords.hash).toHaveBeenCalled(); // the dummy hash was actually generated
    expect(passwords.verify).toHaveBeenCalledWith("dummy-hash", "anything");
  });

  it("memoizes the dummy hash across multiple nonexistent-email attempts", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.login({ email: "a@example.com", password: "x" }, {})).rejects.toThrow();
    await expect(service.login({ email: "b@example.com", password: "y" }, {})).rejects.toThrow();

    expect(passwords.hash).toHaveBeenCalledTimes(1);
  });

  it("rejects a DISABLED account with the same generic error, never a distinct message", async () => {
    prisma.user.findUnique.mockResolvedValue({ ...USER, status: UserStatus.DISABLED });

    await expect(
      service.login({ email: "customer@example.com", password: "correct-password" }, {}),
    ).rejects.toThrow(UnauthorizedException);
    expect(sessions.createSession).not.toHaveBeenCalled();
  });

  it("never grants elevated permissions beyond what the session's real role/permission resolution returns", async () => {
    sessions.validateSession.mockResolvedValue({ ...AUTH_CONTEXT, permissions: [] });

    const result = await service.login({ email: "customer@example.com", password: "correct-password" }, {});

    expect(result.user.permissions).toEqual([]);
  });
});

describe("AuthService.logout", () => {
  it("revokes the session by id via SessionService (unchanged, reused as-is)", async () => {
    const sessions = makeSessionsMock();
    const service = makeService({ sessions });

    await service.logout("session-token");

    expect(sessions.revokeSession).toHaveBeenCalledWith("session-token");
  });
});

describe("AuthService.getSafeUser", () => {
  it("returns a safe user shape combining the User row with the auth context's permissions", async () => {
    const prisma = makePrismaMock();
    const service = makeService({ prisma });

    const result = await service.getSafeUser(AUTH_CONTEXT);

    expect(result).toEqual({
      id: "user-1",
      email: "customer@example.com",
      firstName: "Test",
      lastName: "Testsson",
      locale: "sv-SE",
      permissions: ["orders.fulfill"],
      emailVerifiedAt: null,
    });
    expect(result).not.toHaveProperty("passwordHash");
  });
});

const GOOGLE_PROFILE = {
  sub: "google-sub-1",
  email: "customer@example.com",
  emailVerified: true,
  givenName: "Test",
  familyName: "Testsson",
};

describe("AuthService.loginWithGoogle", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let sessions: ReturnType<typeof makeSessionsMock>;
  let service: AuthService;

  beforeEach(() => {
    prisma = makePrismaMock();
    sessions = makeSessionsMock();
    service = makeService({ prisma, sessions });
  });

  it("rejects an unverified Google email, without ever touching the database", async () => {
    await expect(service.loginWithGoogle({ ...GOOGLE_PROFILE, emailVerified: false }, {})).rejects.toMatchObject({
      response: { error: "EmailNotVerified" },
    });
    expect(prisma.oAuthAccount.findUnique).not.toHaveBeenCalled();
  });

  it("logs straight in via an existing OAuthAccount, without touching User.findUnique/create at all", async () => {
    prisma.oAuthAccount.findUnique.mockResolvedValue({ user: USER });

    const result = await service.loginWithGoogle(GOOGLE_PROFILE, {});

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.oAuthAccount.upsert).not.toHaveBeenCalled(); // already linked — nothing new to link
    expect(result.user.email).toBe("customer@example.com");
  });

  it("links to an existing, already-verified User matched by email on first-time Google sign-in, keeping the password", async () => {
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    const verifiedUser = { ...USER, emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z") };
    prisma.user.findUnique.mockResolvedValue(verifiedUser);

    await service.loginWithGoogle(GOOGLE_PROFILE, {});

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(sessions.revokeAllSessionsForUser).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ passwordHash: null }) }),
    );
    expect(prisma.oAuthAccount.upsert).toHaveBeenCalledWith({
      where: { provider_providerAccountId: { provider: "google", providerAccountId: "google-sub-1" } },
      create: { userId: "user-1", provider: "google", providerAccountId: "google-sub-1" },
      update: {},
    });
  });

  // The account-takeover fix this feature introduces: self-service password
  // registration means anyone can register someone else's email address
  // with a password they control. Google's verified-email claim must win
  // over an unproven (never-verified) password claim on the same address.
  it("nulls the password and revokes sessions of an existing UNVERIFIED User matched by email", async () => {
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ ...USER, emailVerifiedAt: null });
    prisma.user.update.mockResolvedValue({ ...USER, passwordHash: null, emailVerifiedAt: new Date() });

    await service.loginWithGoogle(GOOGLE_PROFILE, {});

    expect(sessions.revokeAllSessionsForUser).toHaveBeenCalledWith("user-1", prisma);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: null, emailVerifiedAt: expect.any(Date) },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("auto-creates a new User with no passwordHash when no account or email match exists", async () => {
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ ...USER, id: "user-new", passwordHash: null });

    await service.loginWithGoogle(GOOGLE_PROFILE, {});

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: "customer@example.com",
        passwordHash: null,
        firstName: "Test",
        lastName: "Testsson",
        emailVerifiedAt: expect.any(Date),
      },
    });
    expect(prisma.oAuthAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { userId: "user-new", provider: "google", providerAccountId: "google-sub-1" } }),
    );
    expect(sessions.createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-new" }));
  });

  it("rejects a DISABLED account reached via an existing Google link, with the same generic error as password login", async () => {
    prisma.oAuthAccount.findUnique.mockResolvedValue({ user: { ...USER, status: UserStatus.DISABLED } });

    await expect(service.loginWithGoogle(GOOGLE_PROFILE, {})).rejects.toMatchObject({
      response: { error: "InvalidCredentials" },
    });
    expect(sessions.createSession).not.toHaveBeenCalled();
  });
});

describe("AuthService.register", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let passwords: ReturnType<typeof makePasswordsMock>;
  let notifications: ReturnType<typeof makeNotificationsMock>;
  let service: AuthService;

  beforeEach(() => {
    prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue(null); // no existing account by default
    passwords = makePasswordsMock();
    notifications = makeNotificationsMock();
    service = makeService({ prisma, passwords, notifications });
  });

  it("creates a User, issues a verification token, and sends the verification email", async () => {
    const result = await service.register({
      email: "new@example.com",
      password: "a-strong-password",
      firstName: "Ada",
      lastName: "Lovelace",
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: "new@example.com", passwordHash: "dummy-hash", firstName: "Ada", lastName: "Lovelace" },
    });
    expect(prisma.accountActionToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION }) }),
    );
    expect(notifications.sendVerificationEmail).toHaveBeenCalledWith("user-new", expect.any(String));
    expect(result).toEqual({ message: expect.any(String) });
  });

  it("never returns a session/token — registration never auto-logs-in", async () => {
    const result = await service.register({ email: "new@example.com", password: "a-strong-password" });

    expect(result).not.toHaveProperty("token");
    expect(result).not.toHaveProperty("user");
  });

  it("is enumeration-safe: an existing email creates nothing and sends nothing, but returns the identical response", async () => {
    prisma.user.findUnique.mockResolvedValue(USER);

    const result = await service.register({ email: "customer@example.com", password: "a-strong-password" });

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.accountActionToken.create).not.toHaveBeenCalled();
    expect(notifications.sendVerificationEmail).not.toHaveBeenCalled();
    // Still hashes-and-discards the submitted password, for timing parity
    // with the real-creation branch.
    expect(passwords.hash).toHaveBeenCalledWith("a-strong-password");
    expect(result).toEqual({ message: expect.any(String) });
  });

  it("is enumeration-safe when it loses a genuine concurrent race for the same email (a real P2002 from tx.user.create)", async () => {
    const emailUniqueViolation = new Prisma.PrismaClientKnownRequestError(
      "duplicate key value violates unique constraint",
      {
        code: "P2002",
        clientVersion: "test",
        meta: {
          modelName: "User",
          driverAdapterError: { cause: { constraint: { index: "User_email_key" }, table: "User" } },
        },
      },
    );
    prisma.user.create.mockRejectedValue(emailUniqueViolation);

    const result = await service.register({ email: "new@example.com", password: "a-strong-password" });

    expect(result).toEqual({ message: expect.any(String) });
    expect(notifications.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("rethrows any other, unrelated database error rather than silently swallowing it", async () => {
    prisma.user.create.mockRejectedValue(new Error("connection lost"));

    await expect(
      service.register({ email: "new@example.com", password: "a-strong-password" }),
    ).rejects.toThrow("connection lost");
  });

  it("returns the exact same response shape whether the email existed or not", async () => {
    const existingResult = await (async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      return service.register({ email: "customer@example.com", password: "a-strong-password" });
    })();

    const newResult = await (async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      return service.register({ email: "new@example.com", password: "a-strong-password" });
    })();

    expect(existingResult).toEqual(newResult);
  });
});

describe("AuthService.verifyEmail", () => {
  it("consumes a valid token and marks the user's email verified", async () => {
    const prisma = makePrismaMock();
    const service = makeService({ prisma });

    const result = await service.verifyEmail({ token: "a-valid-token" });

    expect(prisma.accountActionToken.updateMany).toHaveBeenCalledWith({
      where: {
        tokenHash: expect.any(String),
        purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION,
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { consumedAt: expect.any(Date) },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { emailVerifiedAt: expect.any(Date) },
    });
    expect(result).toEqual({ message: expect.any(String) });
  });

  it("rejects an invalid/expired/already-consumed token with a 400, and never touches the User", async () => {
    const prisma = makePrismaMock();
    prisma.accountActionToken.updateMany.mockResolvedValue({ count: 0 });
    const service = makeService({ prisma });

    await expect(service.verifyEmail({ token: "bad-token" })).rejects.toMatchObject({
      response: { error: "InvalidOrExpiredToken" },
    });
    await expect(service.verifyEmail({ token: "bad-token" })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("AuthService.resendVerification", () => {
  it("issues a fresh token and sends an email for an eligible (unverified, ACTIVE) account", async () => {
    const prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue({ ...USER, emailVerifiedAt: null });
    const notifications = makeNotificationsMock();
    const service = makeService({ prisma, notifications });

    const result = await service.resendVerification({ email: "customer@example.com" });

    expect(notifications.sendVerificationEmail).toHaveBeenCalledWith("user-1", expect.any(String));
    expect(result).toEqual({ message: expect.any(String) });
  });

  it.each([
    ["a nonexistent email", null],
    ["an already-verified account", { ...USER, emailVerifiedAt: new Date() }],
    ["a DISABLED account", { ...USER, status: UserStatus.DISABLED }],
  ])("is enumeration-safe and sends nothing for %s, returning the identical response", async (_label, userRow) => {
    const prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue(userRow);
    const notifications = makeNotificationsMock();
    const service = makeService({ prisma, notifications });

    const result = await service.resendVerification({ email: "customer@example.com" });

    expect(notifications.sendVerificationEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ message: expect.any(String) });
  });
});

describe("AuthService.requestPasswordReset", () => {
  it("issues a token and sends an email for an eligible (ACTIVE, password-based) account", async () => {
    const prisma = makePrismaMock();
    const notifications = makeNotificationsMock();
    const service = makeService({ prisma, notifications });

    const result = await service.requestPasswordReset({ email: "customer@example.com" });

    expect(prisma.accountActionToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ purpose: AccountActionTokenPurpose.PASSWORD_RESET }) }),
    );
    expect(notifications.sendPasswordResetEmail).toHaveBeenCalledWith("user-1", expect.any(String));
    expect(result).toEqual({ message: expect.any(String) });
  });

  it.each([
    ["a nonexistent email", null],
    ["a Google-only account (no password to reset)", { ...USER, passwordHash: null }],
    ["a DISABLED account", { ...USER, status: UserStatus.DISABLED }],
  ])("is enumeration-safe and sends nothing for %s, returning the identical response", async (_label, userRow) => {
    const prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue(userRow);
    const notifications = makeNotificationsMock();
    const service = makeService({ prisma, notifications });

    const result = await service.requestPasswordReset({ email: "customer@example.com" });

    expect(notifications.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ message: expect.any(String) });
  });
});

describe("AuthService.resetPassword", () => {
  it("consumes the token, sets the new password hash, verifies the email, and revokes all sessions", async () => {
    const prisma = makePrismaMock();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ ...USER, emailVerifiedAt: null });
    const passwords = makePasswordsMock();
    const sessions = makeSessionsMock();
    const service = makeService({ prisma, passwords, sessions });

    const result = await service.resetPassword({ token: "a-valid-token", password: "a-new-strong-password" });

    expect(passwords.hash).toHaveBeenCalledWith("a-new-strong-password");
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: "dummy-hash", emailVerifiedAt: expect.any(Date) },
    });
    expect(sessions.revokeAllSessionsForUser).toHaveBeenCalledWith("user-1", prisma);
    expect(result).toEqual({ message: expect.any(String) });
  });

  it("preserves the existing emailVerifiedAt timestamp rather than bumping it, for an already-verified account", async () => {
    const verifiedAt = new Date("2026-01-01T00:00:00.000Z");
    const prisma = makePrismaMock();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ ...USER, emailVerifiedAt: verifiedAt });
    const service = makeService({ prisma });

    await service.resetPassword({ token: "a-valid-token", password: "a-new-strong-password" });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: "dummy-hash", emailVerifiedAt: verifiedAt },
    });
  });

  it("rejects an invalid/expired/already-consumed token with a 400, hashing nothing and revoking nothing", async () => {
    const prisma = makePrismaMock();
    prisma.accountActionToken.updateMany.mockResolvedValue({ count: 0 });
    const passwords = makePasswordsMock();
    const sessions = makeSessionsMock();
    const service = makeService({ prisma, passwords, sessions });

    await expect(
      service.resetPassword({ token: "bad-token", password: "a-new-strong-password" }),
    ).rejects.toMatchObject({ response: { error: "InvalidOrExpiredToken" } });
    expect(passwords.hash).not.toHaveBeenCalled();
    expect(sessions.revokeAllSessionsForUser).not.toHaveBeenCalled();
  });
});

describe("AuthService.getLoginMethod", () => {
  it("returns \"password\" for an account with a password set", async () => {
    const prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue({ passwordHash: "real-hash" });
    const service = makeService({ prisma });

    await expect(service.getLoginMethod({ email: "customer@example.com" })).resolves.toEqual({
      method: "password",
    });
  });

  it.each([
    ["a Google-only account", { passwordHash: null }],
    ["a nonexistent email", null],
  ])("returns \"otp\" for %s — the two are never distinguished here", async (_label, userRow) => {
    const prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue(userRow);
    const service = makeService({ prisma });

    await expect(service.getLoginMethod({ email: "customer@example.com" })).resolves.toEqual({ method: "otp" });
  });

  it("has no side effects — no token issued, no email sent", async () => {
    const prisma = makePrismaMock();
    const notifications = makeNotificationsMock();
    const service = makeService({ prisma, notifications });

    await service.getLoginMethod({ email: "customer@example.com" });

    expect(prisma.loginOtp.create).not.toHaveBeenCalled();
    expect(notifications.sendLoginOtpEmail).not.toHaveBeenCalled();
  });
});

describe("AuthService.requestLoginOtp", () => {
  it("issues a code and sends it for an eligible ACTIVE account (password-based)", async () => {
    const prisma = makePrismaMock();
    const notifications = makeNotificationsMock();
    const service = makeService({ prisma, notifications });

    const result = await service.requestLoginOtp({ email: "customer@example.com" });

    expect(prisma.loginOtp.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
    expect(prisma.loginOtp.create).toHaveBeenCalledWith({
      data: { userId: "user-1", codeHash: expect.any(String), expiresAt: expect.any(Date) },
    });
    expect(notifications.sendLoginOtpEmail).toHaveBeenCalledWith("user-1", expect.stringMatching(/^\d{6}$/));
    expect(result).toEqual({ message: expect.any(String) });
  });

  it("is eligible for a Google-only account too — email-OTP is an equally strong proof of ownership", async () => {
    const prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue({ ...USER, passwordHash: null });
    const notifications = makeNotificationsMock();
    const service = makeService({ prisma, notifications });

    await service.requestLoginOtp({ email: "customer@example.com" });

    expect(notifications.sendLoginOtpEmail).toHaveBeenCalled();
  });

  it.each([
    ["a nonexistent email", null],
    ["a DISABLED account", { ...USER, status: UserStatus.DISABLED }],
  ])("is enumeration-safe and sends nothing for %s, returning the identical response", async (_label, userRow) => {
    const prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue(userRow);
    const notifications = makeNotificationsMock();
    const service = makeService({ prisma, notifications });

    const result = await service.requestLoginOtp({ email: "customer@example.com" });

    expect(notifications.sendLoginOtpEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ message: expect.any(String) });
  });

  it("silently no-ops (no second email) when a code was already issued within the resend cooldown, but returns the identical response", async () => {
    const prisma = makePrismaMock();
    prisma.loginOtp.findFirst.mockResolvedValue({ id: "existing-otp" });
    const notifications = makeNotificationsMock();
    const service = makeService({ prisma, notifications });

    const result = await service.requestLoginOtp({ email: "customer@example.com" });

    expect(prisma.loginOtp.create).not.toHaveBeenCalled();
    expect(notifications.sendLoginOtpEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ message: expect.any(String) });
  });
});

describe("AuthService.loginWithOtp", () => {
  const CODE = "042017";

  it("issues a session on a correct, current code", async () => {
    const prisma = makePrismaMock();
    prisma.loginOtp.findFirst.mockResolvedValue({ id: "otp-1", attempts: 0, codeHash: hashLoginOtpCode(CODE) });
    const sessions = makeSessionsMock();
    const service = makeService({ prisma, sessions });

    const result = await service.loginWithOtp({ email: "customer@example.com", code: CODE }, {});

    expect(prisma.loginOtp.updateMany).toHaveBeenCalledWith({
      where: { id: "otp-1", consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
    expect(sessions.createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }));
    expect(result.user.email).toBe("customer@example.com");
  });

  it("backfills emailVerifiedAt on a successful login when still unverified, and reflects it in the returned user", async () => {
    const prisma = makePrismaMock();
    const verifiedAt = new Date("2026-01-01T00:00:00.000Z");
    prisma.user.findUnique.mockResolvedValue({ ...USER, emailVerifiedAt: null });
    // The real Prisma `update()` call returns the fresh row — this must be
    // what flows into the session response, not the stale pre-update
    // `user` object read at the top of the method (a real regression this
    // test caught: issueSession was called with the stale object, so the
    // response reported emailVerifiedAt: null in the very call that just
    // set it).
    prisma.user.update.mockResolvedValue({ ...USER, emailVerifiedAt: verifiedAt });
    prisma.loginOtp.findFirst.mockResolvedValue({ id: "otp-1", attempts: 0, codeHash: hashLoginOtpCode(CODE) });
    const service = makeService({ prisma });

    const result = await service.loginWithOtp({ email: "customer@example.com", code: CODE }, {});

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { emailVerifiedAt: expect.any(Date) },
    });
    expect(result.user.emailVerifiedAt).toBe(verifiedAt.toISOString());
  });

  it("does not re-touch emailVerifiedAt for an already-verified account", async () => {
    const verifiedAt = new Date("2026-01-01T00:00:00.000Z");
    const prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue({ ...USER, emailVerifiedAt: verifiedAt });
    prisma.loginOtp.findFirst.mockResolvedValue({ id: "otp-1", attempts: 0, codeHash: hashLoginOtpCode(CODE) });
    const service = makeService({ prisma });

    const result = await service.loginWithOtp({ email: "customer@example.com", code: CODE }, {});

    // issueSession always updates lastLoginAt regardless — only the
    // emailVerifiedAt backfill itself must be skipped for an
    // already-verified account.
    expect(prisma.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ emailVerifiedAt: expect.anything() }) }),
    );
    expect(result.user.emailVerifiedAt).toBe(verifiedAt.toISOString());
  });

  it("rejects a wrong code with a generic 400, incrementing the attempt counter, without issuing a session", async () => {
    const prisma = makePrismaMock();
    prisma.loginOtp.findFirst.mockResolvedValue({ id: "otp-1", attempts: 0, codeHash: hashLoginOtpCode(CODE) });
    const sessions = makeSessionsMock();
    const service = makeService({ prisma, sessions });

    await expect(
      service.loginWithOtp({ email: "customer@example.com", code: "000000" }, {}),
    ).rejects.toMatchObject({ response: { error: "InvalidOrExpiredCode" } });

    expect(prisma.loginOtp.update).toHaveBeenCalledWith({
      where: { id: "otp-1" },
      data: { attempts: { increment: 1 } },
    });
    expect(sessions.createSession).not.toHaveBeenCalled();
  });

  it("kills the code (consumes it) once the max-attempts threshold is reached", async () => {
    const prisma = makePrismaMock();
    prisma.loginOtp.findFirst.mockResolvedValue({ id: "otp-1", attempts: 4, codeHash: hashLoginOtpCode(CODE) });
    prisma.loginOtp.update.mockResolvedValue({ attempts: 5 });
    const service = makeService({ prisma });

    await expect(
      service.loginWithOtp({ email: "customer@example.com", code: "000000" }, {}),
    ).rejects.toMatchObject({ response: { error: "InvalidOrExpiredCode" } });

    expect(prisma.loginOtp.update).toHaveBeenCalledWith({
      where: { id: "otp-1" },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it("rejects when no current unconsumed/unexpired code exists for the user", async () => {
    const prisma = makePrismaMock();
    prisma.loginOtp.findFirst.mockResolvedValue(null);
    const service = makeService({ prisma });

    await expect(
      service.loginWithOtp({ email: "customer@example.com", code: CODE }, {}),
    ).rejects.toMatchObject({ response: { error: "InvalidOrExpiredCode" } });
  });

  it("rejects for a nonexistent email with the identical generic error", async () => {
    const prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue(null);
    const service = makeService({ prisma });

    await expect(
      service.loginWithOtp({ email: "nobody@example.com", code: CODE }, {}),
    ).rejects.toMatchObject({ response: { error: "InvalidOrExpiredCode" } });
  });

  it("rejects for a DISABLED account with the identical generic error", async () => {
    const prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue({ ...USER, status: UserStatus.DISABLED });
    const service = makeService({ prisma });

    await expect(
      service.loginWithOtp({ email: "customer@example.com", code: CODE }, {}),
    ).rejects.toMatchObject({ response: { error: "InvalidOrExpiredCode" } });
  });

  it("is race-safe: loses the consumption race when another request already consumed the same correct code", async () => {
    const prisma = makePrismaMock();
    prisma.loginOtp.findFirst.mockResolvedValue({ id: "otp-1", attempts: 0, codeHash: hashLoginOtpCode(CODE) });
    prisma.loginOtp.updateMany.mockResolvedValue({ count: 0 }); // someone else won
    const sessions = makeSessionsMock();
    const service = makeService({ prisma, sessions });

    await expect(
      service.loginWithOtp({ email: "customer@example.com", code: CODE }, {}),
    ).rejects.toMatchObject({ response: { error: "InvalidOrExpiredCode" } });
    expect(sessions.createSession).not.toHaveBeenCalled();
  });
});
