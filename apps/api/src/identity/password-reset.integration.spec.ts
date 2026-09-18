// Integration test (TESTING.md §3 — Vitest + Testcontainers, real Postgres).
// Exercises real expiresAt/DateTime comparisons and a real Session row being
// revoked — neither provable against a mocked Prisma client.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { AccountActionTokenPurpose } from "@ame-de-fil/database";
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
import { seedUserWithPermissions, seedAccountActionToken } from "../test/fixtures.ts";

function fakeConfig(ttlHours = 1): ConfigService<Env, true> {
  return { get: () => ttlHours } as unknown as ConfigService<Env, true>;
}

describe("AuthService.resetPassword — real Postgres", () => {
  let db: TestDatabase;
  let sessions: SessionService;
  let auth: AuthService;

  beforeAll(async () => {
    db = await startTestDatabase();
    sessions = new SessionService(db.prisma, fakeConfig());
    const notifications = new NotificationsService(
      db.prisma,
      new PendingEmailProvider(),
      fakeConfig(),
    );
    auth = new AuthService(db.prisma, new PasswordService(), sessions, notifications, fakeConfig());
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase(db);
  });

  it("rejects a real, already-expired token (real expiresAt comparison, not a mocked clock)", async () => {
    const fixture = await seedUserWithPermissions(db.prisma, []);
    const { plaintextToken } = await seedAccountActionToken(
      db.prisma,
      fixture.userId,
      AccountActionTokenPurpose.PASSWORD_RESET,
      { expiresAt: new Date(Date.now() - 1000) },
    );

    await expect(
      auth.resetPassword({ token: plaintextToken, password: "a-new-strong-password" }),
    ).rejects.toThrow();

    const user = await db.prisma.user.findUniqueOrThrow({ where: { id: fixture.userId } });
    expect(user.passwordHash).not.toBe(await new PasswordService().hash("a-new-strong-password"));
  });

  it("rejects an already-consumed token", async () => {
    const fixture = await seedUserWithPermissions(db.prisma, []);
    const { plaintextToken } = await seedAccountActionToken(
      db.prisma,
      fixture.userId,
      AccountActionTokenPurpose.PASSWORD_RESET,
      { consumedAt: new Date() },
    );

    await expect(
      auth.resetPassword({ token: plaintextToken, password: "a-new-strong-password" }),
    ).rejects.toThrow();
  });

  it("a successful reset revokes a real, previously-issued session", async () => {
    const fixture = await seedUserWithPermissions(db.prisma, ["orders.fulfill"]);
    const oldSession = await sessions.createSession({ userId: fixture.userId });
    expect(await sessions.validateSession(oldSession.token)).not.toBeNull();

    const { plaintextToken } = await seedAccountActionToken(
      db.prisma,
      fixture.userId,
      AccountActionTokenPurpose.PASSWORD_RESET,
    );

    await auth.resetPassword({ token: plaintextToken, password: "a-new-strong-password" });

    expect(await sessions.validateSession(oldSession.token)).toBeNull();

    // The new password actually works for a subsequent login.
    const login = await auth.login({ email: fixture.email, password: "a-new-strong-password" }, {});
    expect(login.user.id).toBe(fixture.userId);
  });

  it("marks a not-yet-verified account verified as a side effect of a successful reset", async () => {
    const fixture = await seedUserWithPermissions(db.prisma, [], { emailVerifiedAt: null });
    const { plaintextToken } = await seedAccountActionToken(
      db.prisma,
      fixture.userId,
      AccountActionTokenPurpose.PASSWORD_RESET,
    );

    await auth.resetPassword({ token: plaintextToken, password: "a-new-strong-password" });

    const user = await db.prisma.user.findUniqueOrThrow({ where: { id: fixture.userId } });
    expect(user.emailVerifiedAt).not.toBeNull();
  });
});
