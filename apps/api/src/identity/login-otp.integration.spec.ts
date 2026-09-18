// Integration test (TESTING.md §3 — Vitest + Testcontainers, real Postgres).
// Exercises real expiresAt/DateTime comparisons, real atomic attempts
// increments, and a real consumption race — none provable against a mocked
// Prisma client (DECISIONS.md ADR-036).
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
import { seedUserWithPermissions, seedLoginOtp } from "../test/fixtures.ts";

function fakeConfig(ttlMinutes = 10): ConfigService<Env, true> {
  return { get: () => ttlMinutes } as unknown as ConfigService<Env, true>;
}

describe("AuthService OTP login — real Postgres", () => {
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

  it("issues a session on a correct, current code, and marks a not-yet-verified account verified", async () => {
    const fixture = await seedUserWithPermissions(db.prisma, [], { emailVerifiedAt: null });
    const { plaintextCode } = await seedLoginOtp(db.prisma, fixture.userId);

    const result = await auth.loginWithOtp({ email: fixture.email, code: plaintextCode }, {});

    expect(result.user.id).toBe(fixture.userId);
    expect(result.user.emailVerifiedAt).not.toBeNull();

    const session = await db.prisma.session.findUniqueOrThrow({ where: { id: result.token } });
    expect(session.userId).toBe(fixture.userId);
  });

  it("rejects a real, already-expired code (real expiresAt comparison, not a mocked clock)", async () => {
    const fixture = await seedUserWithPermissions(db.prisma, []);
    const { plaintextCode } = await seedLoginOtp(db.prisma, fixture.userId, {
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      auth.loginWithOtp({ email: fixture.email, code: plaintextCode }, {}),
    ).rejects.toThrow();
  });

  it("rejects an already-consumed code", async () => {
    const fixture = await seedUserWithPermissions(db.prisma, []);
    const { plaintextCode } = await seedLoginOtp(db.prisma, fixture.userId, {
      consumedAt: new Date(),
    });

    await expect(
      auth.loginWithOtp({ email: fixture.email, code: plaintextCode }, {}),
    ).rejects.toThrow();
  });

  it("increments the real attempts counter on a wrong guess, and kills the code after the 5th", async () => {
    const fixture = await seedUserWithPermissions(db.prisma, []);
    const { plaintextCode, otpId } = await seedLoginOtp(db.prisma, fixture.userId);
    const wrongCode = plaintextCode === "000000" ? "111111" : "000000";

    for (let attempt = 1; attempt <= 5; attempt++) {
      await expect(
        auth.loginWithOtp({ email: fixture.email, code: wrongCode }, {}),
      ).rejects.toThrow();
      const row = await db.prisma.loginOtp.findUniqueOrThrow({ where: { id: otpId } });
      expect(row.attempts).toBe(attempt);
      if (attempt < 5) expect(row.consumedAt).toBeNull();
    }

    // The 5th wrong attempt killed it — even the *correct* code no longer
    // works, proving the code is truly dead, not just "still wrong."
    const dead = await db.prisma.loginOtp.findUniqueOrThrow({ where: { id: otpId } });
    expect(dead.consumedAt).not.toBeNull();
    await expect(
      auth.loginWithOtp({ email: fixture.email, code: plaintextCode }, {}),
    ).rejects.toThrow();
  });

  it("two concurrent verifications of the same correct code: exactly one succeeds", async () => {
    const fixture = await seedUserWithPermissions(db.prisma, []);
    const { plaintextCode } = await seedLoginOtp(db.prisma, fixture.userId);

    const results = await Promise.allSettled([
      auth.loginWithOtp({ email: fixture.email, code: plaintextCode }, {}),
      auth.loginWithOtp({ email: fixture.email, code: plaintextCode }, {}),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it("requesting a new code invalidates the previous one — only the newest code works", async () => {
    const fixture = await seedUserWithPermissions(db.prisma, []);
    // Backdated past the resend cooldown — a freshly-seeded row would
    // otherwise make requestLoginOtp's own cooldown check silently no-op,
    // which is a separate, already-covered behavior, not what this test
    // is about.
    const { plaintextCode: firstCode } = await seedLoginOtp(db.prisma, fixture.userId, {
      createdAt: new Date(Date.now() - 5 * 60 * 1000),
    });

    await auth.requestLoginOtp({ email: fixture.email });

    // The first, directly-seeded code is now dead...
    await expect(
      auth.loginWithOtp({ email: fixture.email, code: firstCode }, {}),
    ).rejects.toThrow();

    // ...but a real second code for this user exists and is still valid —
    // fetched directly since requestLoginOtp only ever emails the plaintext,
    // never returns or persists it anywhere else.
    const current = await db.prisma.loginOtp.findFirstOrThrow({
      where: { userId: fixture.userId, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    expect(current.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("does not issue a second code within the resend cooldown, but the request still succeeds generically", async () => {
    const fixture = await seedUserWithPermissions(db.prisma, []);

    await auth.requestLoginOtp({ email: fixture.email });
    const afterFirst = await db.prisma.loginOtp.count({ where: { userId: fixture.userId } });

    await auth.requestLoginOtp({ email: fixture.email });
    const afterSecond = await db.prisma.loginOtp.count({ where: { userId: fixture.userId } });

    expect(afterSecond).toBe(afterFirst);
  });

  it("is enumeration-safe: a nonexistent email's request creates no User and throws nothing", async () => {
    const email = `nobody-${Date.now()}@example.com`;

    await expect(auth.requestLoginOtp({ email })).resolves.toEqual({ message: expect.any(String) });

    const userCount = await db.prisma.user.count({ where: { email } });
    expect(userCount).toBe(0);
  });
});
