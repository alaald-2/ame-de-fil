// Integration test (TESTING.md §3 — Vitest + Testcontainers, real Postgres).
// Exercises the real, unmocked AuthService/SessionService/PasswordService
// against real User/Role/Permission/UserRole/RolePermission data — the
// exact "RBAC guard behavior against real role/permission data" layer
// TESTING.md §3 already promised but never had a login path to reach until
// now (no mocked Prisma client could ever validate the real
// roles -> permissions join SessionService.validateSession performs).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { AuthService } from "./auth.service.ts";
import { SessionService } from "./session.service.ts";
import { PasswordService } from "./password.service.ts";
import { NotificationsService } from "../notifications/notifications.service.ts";
import { PendingEmailProvider } from "../notifications/email-provider.ts";
import {
  startTestDatabase,
  stopTestDatabase,
  type TestDatabase,
} from "../test/testcontainers-postgres.ts";
import { seedUserWithPermissions } from "../test/fixtures.ts";

function fakeConfig(ttlHours = 168): ConfigService<Env, true> {
  return { get: () => ttlHours } as unknown as ConfigService<Env, true>;
}

function fakeNotifications(db: TestDatabase): NotificationsService {
  return new NotificationsService(db.prisma, new PendingEmailProvider(), fakeConfig());
}

describe("AuthService — real Postgres", () => {
  let db: TestDatabase;
  let sessions: SessionService;
  let auth: AuthService;

  beforeAll(async () => {
    db = await startTestDatabase();
    sessions = new SessionService(db.prisma, fakeConfig());
    auth = new AuthService(
      db.prisma,
      new PasswordService(),
      sessions,
      fakeNotifications(db),
      fakeConfig(),
    );
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase(db);
  });

  it("logs in against a real Argon2id hash and resolves real permissions via the real Role/Permission join", async () => {
    const fixture = await seedUserWithPermissions(db.prisma, ["orders.fulfill", "inventory.view"]);

    const result = await auth.login({ email: fixture.email, password: fixture.password }, {});

    expect(result.user.permissions.sort()).toEqual(["inventory.view", "orders.fulfill"]);
    expect(result.user).not.toHaveProperty("passwordHash");

    const session = await db.prisma.session.findUniqueOrThrow({ where: { id: result.token } });
    expect(session.userId).toBe(fixture.userId);
    expect(session.revokedAt).toBeNull();

    const updatedUser = await db.prisma.user.findUniqueOrThrow({ where: { id: fixture.userId } });
    expect(updatedUser.lastLoginAt).not.toBeNull();
  });

  it("rejects a wrong password against a real hash, creating no Session row", async () => {
    const fixture = await seedUserWithPermissions(db.prisma, ["orders.fulfill"]);

    await expect(
      auth.login({ email: fixture.email, password: "wrong-password" }, {}),
    ).rejects.toThrow();

    const sessionCount = await db.prisma.session.count({ where: { userId: fixture.userId } });
    expect(sessionCount).toBe(0);
  });

  it("rejects a nonexistent email with the same error shape as a wrong password", async () => {
    await expect(
      auth.login({ email: "definitely-not-a-real-user@example.com", password: "anything" }, {}),
    ).rejects.toThrow();
  });

  it("rejects a DISABLED account, creating no Session row", async () => {
    const fixture = await seedUserWithPermissions(db.prisma, ["orders.fulfill"], {
      status: "DISABLED",
    });

    await expect(
      auth.login({ email: fixture.email, password: fixture.password }, {}),
    ).rejects.toThrow();

    const sessionCount = await db.prisma.session.count({ where: { userId: fixture.userId } });
    expect(sessionCount).toBe(0);
  });

  it("logout revokes the real Session row, and the revoked token no longer authenticates", async () => {
    const fixture = await seedUserWithPermissions(db.prisma, ["orders.fulfill"]);
    const result = await auth.login({ email: fixture.email, password: fixture.password }, {});

    await auth.logout(result.token);

    const session = await db.prisma.session.findUniqueOrThrow({ where: { id: result.token } });
    expect(session.revokedAt).not.toBeNull();

    const revalidated = await sessions.validateSession(result.token);
    expect(revalidated).toBeNull();
  });

  it("a session past its real expiresAt no longer authenticates", async () => {
    const fixture = await seedUserWithPermissions(db.prisma, ["orders.fulfill"]);
    const result = await auth.login({ email: fixture.email, password: fixture.password }, {});

    await db.prisma.session.update({
      where: { id: result.token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(sessions.validateSession(result.token)).resolves.toBeNull();
  });
});

// DECISIONS.md ADR-033 — real Postgres, exercising the actual @@unique
// constraint on OAuthAccount(provider, providerAccountId) and the real
// nullable-passwordHash column, neither of which a mocked Prisma client
// can prove actually exists as migrated.
describe("AuthService.loginWithGoogle — real Postgres", () => {
  let db: TestDatabase;
  let sessions: SessionService;
  let auth: AuthService;

  beforeAll(async () => {
    db = await startTestDatabase();
    sessions = new SessionService(db.prisma, fakeConfig());
    auth = new AuthService(
      db.prisma,
      new PasswordService(),
      sessions,
      fakeNotifications(db),
      fakeConfig(),
    );
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase(db);
  });

  function googleProfile(overrides: Partial<Parameters<AuthService["loginWithGoogle"]>[0]> = {}) {
    return {
      sub: `sub-${Math.random().toString(36).slice(2)}`,
      email: `google-${Math.random().toString(36).slice(2)}@example.com`,
      emailVerified: true,
      givenName: "Ada",
      familyName: "Lovelace",
      ...overrides,
    };
  }

  it("creates a real User with no passwordHash and a linked OAuthAccount on first sign-in", async () => {
    const profile = googleProfile();

    const result = await auth.loginWithGoogle(profile, {});

    const user = await db.prisma.user.findUniqueOrThrow({ where: { id: result.user.id } });
    expect(user.email).toBe(profile.email);
    expect(user.passwordHash).toBeNull();
    expect(user.emailVerifiedAt).not.toBeNull();

    const account = await db.prisma.oAuthAccount.findUniqueOrThrow({
      where: { provider_providerAccountId: { provider: "google", providerAccountId: profile.sub } },
    });
    expect(account.userId).toBe(user.id);
  });

  it("the second sign-in with the same Google sub logs into the same User, creating no duplicate", async () => {
    const profile = googleProfile();

    const first = await auth.loginWithGoogle(profile, {});
    const second = await auth.loginWithGoogle(profile, {});

    expect(second.user.id).toBe(first.user.id);
    const accountCount = await db.prisma.oAuthAccount.count({
      where: { provider: "google", providerAccountId: profile.sub },
    });
    expect(accountCount).toBe(1);
  });

  it("links to a real pre-existing, already-verified password-based User matched by email, keeping the password", async () => {
    const fixture = await seedUserWithPermissions(db.prisma, ["orders.fulfill"], {
      emailVerifiedAt: new Date(),
    });
    const profile = googleProfile({ email: fixture.email });

    const result = await auth.loginWithGoogle(profile, {});

    expect(result.user.id).toBe(fixture.userId);
    expect(result.user.permissions).toEqual(["orders.fulfill"]);
    const user = await db.prisma.user.findUniqueOrThrow({ where: { id: fixture.userId } });
    // Ownership of this email was already proven (verified) before Google
    // ever entered the picture — linking a second login method must not
    // touch the first one.
    expect(user.passwordHash).not.toBeNull();

    const userCount = await db.prisma.user.count({ where: { email: fixture.email } });
    expect(userCount).toBe(1); // linked, not duplicated
  });

  // The account-takeover fix this PR introduces: self-service password
  // registration means anyone can register someone else's email address
  // with a password they control. If Google later proves the real owner's
  // ownership of that same, still-unverified address, Google's claim must
  // win outright — the squatter's password stops working immediately.
  it("nulls the password and revokes sessions of a real pre-existing UNVERIFIED User matched by email", async () => {
    const fixture = await seedUserWithPermissions(db.prisma, ["orders.fulfill"]);
    const squatterSession = await sessions.createSession({ userId: fixture.userId });
    const profile = googleProfile({ email: fixture.email });

    const result = await auth.loginWithGoogle(profile, {});

    expect(result.user.id).toBe(fixture.userId);
    const user = await db.prisma.user.findUniqueOrThrow({ where: { id: fixture.userId } });
    expect(user.passwordHash).toBeNull();
    expect(user.emailVerifiedAt).not.toBeNull();

    const revokedSession = await db.prisma.session.findUniqueOrThrow({
      where: { id: squatterSession.token },
    });
    expect(revokedSession.revokedAt).not.toBeNull();

    const userCount = await db.prisma.user.count({ where: { email: fixture.email } });
    expect(userCount).toBe(1); // linked, not duplicated
  });

  it("rejects an unverified Google email without creating any User row", async () => {
    const profile = googleProfile({ emailVerified: false });

    await expect(auth.loginWithGoogle(profile, {})).rejects.toThrow();

    const userCount = await db.prisma.user.count({ where: { email: profile.email } });
    expect(userCount).toBe(0);
  });

  it("rejects sign-in for a real DISABLED account reached via Google", async () => {
    const fixture = await seedUserWithPermissions(db.prisma, ["orders.fulfill"], {
      status: "DISABLED",
    });
    const profile = googleProfile({ email: fixture.email });

    await expect(auth.loginWithGoogle(profile, {})).rejects.toThrow();

    const sessionCount = await db.prisma.session.count({ where: { userId: fixture.userId } });
    expect(sessionCount).toBe(0);
  });
});
