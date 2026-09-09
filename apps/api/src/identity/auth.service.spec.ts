import { describe, expect, it, vi, beforeEach } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import { Locale, UserStatus } from "@ame-de-fil/database";
import { AuthService } from "./auth.service.ts";
import type { PrismaService } from "../database/prisma.service.ts";
import type { PasswordService } from "./password.service.ts";
import type { SessionService } from "./session.service.ts";

const USER = {
  id: "user-1",
  email: "customer@example.com",
  passwordHash: "real-hash",
  firstName: "Test",
  lastName: "Testsson",
  locale: Locale.sv_SE,
  status: UserStatus.ACTIVE,
};

const AUTH_CONTEXT = {
  userId: "user-1",
  sessionId: "session-token",
  csrfToken: "csrf-token",
  permissions: ["orders.fulfill"],
};

function makePrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(USER),
      findUniqueOrThrow: vi.fn().mockResolvedValue(USER),
      update: vi.fn().mockResolvedValue(USER),
    },
    ...overrides,
  } as unknown as PrismaService & {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
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
  } as unknown as SessionService & {
    createSession: ReturnType<typeof vi.fn>;
    validateSession: ReturnType<typeof vi.fn>;
    revokeSession: ReturnType<typeof vi.fn>;
  };
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
    service = new AuthService(prisma, passwords, sessions);
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
    });
    expect(result.user).not.toHaveProperty("passwordHash");
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
    const service = new AuthService(makePrismaMock(), makePasswordsMock(), sessions);

    await service.logout("session-token");

    expect(sessions.revokeSession).toHaveBeenCalledWith("session-token");
  });
});

describe("AuthService.getSafeUser", () => {
  it("returns a safe user shape combining the User row with the auth context's permissions", async () => {
    const prisma = makePrismaMock();
    const service = new AuthService(prisma, makePasswordsMock(), makeSessionsMock());

    const result = await service.getSafeUser(AUTH_CONTEXT);

    expect(result).toEqual({
      id: "user-1",
      email: "customer@example.com",
      firstName: "Test",
      lastName: "Testsson",
      locale: "sv-SE",
      permissions: ["orders.fulfill"],
    });
    expect(result).not.toHaveProperty("passwordHash");
  });
});
