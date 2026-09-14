// Integration test (TESTING.md §3 — Vitest + Testcontainers, real Postgres).
// Exercises the real, unmocked AuthService against real User.email/
// AccountActionToken.tokenHash unique constraints — exactly the class of
// concurrency/constraint-shape bug a mocked Prisma client can never prove
// doesn't exist (the same rationale as reservation-expiry-race.integration.spec.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { AccountActionTokenPurpose } from "@ame-de-fil/database";
import { AuthService } from "./auth.service.ts";
import { SessionService } from "./session.service.ts";
import { PasswordService } from "./password.service.ts";
import { NotificationsService } from "../notifications/notifications.service.ts";
import { PendingEmailProvider } from "../notifications/email-provider.ts";
import { generateAccountActionToken, hashAccountActionToken } from "../common/account-action-token.ts";
import { startTestDatabase, stopTestDatabase, type TestDatabase } from "../test/testcontainers-postgres.ts";

function fakeConfig(ttlHours = 24): ConfigService<Env, true> {
  return { get: () => ttlHours } as unknown as ConfigService<Env, true>;
}

describe("AuthService.register / verifyEmail — real Postgres concurrency", () => {
  let db: TestDatabase;
  let auth: AuthService;

  beforeAll(async () => {
    db = await startTestDatabase();
    const sessions = new SessionService(db.prisma, fakeConfig());
    const notifications = new NotificationsService(db.prisma, new PendingEmailProvider(), fakeConfig());
    auth = new AuthService(db.prisma, new PasswordService(), sessions, notifications, fakeConfig());
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase(db);
  });

  it("two concurrent registrations for the same email create exactly one User row, both responses identical", async () => {
    const email = `race-${Math.random().toString(36).slice(2)}@example.com`;

    const [first, second] = await Promise.all([
      auth.register({ email, password: "a-strong-password-1" }),
      auth.register({ email, password: "a-strong-password-2" }),
    ]);

    expect(first).toEqual(second);

    const userCount = await db.prisma.user.count({ where: { email } });
    expect(userCount).toBe(1);

    // Exactly one unconsumed verification token exists for the winner — the
    // loser's register() call took the enumeration-safe no-op branch and
    // never issued a second one.
    const user = await db.prisma.user.findUniqueOrThrow({ where: { email } });
    const tokenCount = await db.prisma.accountActionToken.count({
      where: { userId: user.id, purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION, consumedAt: null },
    });
    expect(tokenCount).toBe(1);
  });

  it("registration is case/whitespace-insensitive against an existing row (real email normalization + backfill)", async () => {
    const email = `norm-${Math.random().toString(36).slice(2)}@example.com`;
    await auth.register({ email, password: "a-strong-password" });

    const beforeUserCount = await db.prisma.user.count({ where: { email } });
    await auth.register({ email: `  ${email.toUpperCase()}  `, password: "a-different-password" });
    const afterUserCount = await db.prisma.user.count({ where: { email } });

    expect(afterUserCount).toBe(beforeUserCount);
  });

  it("two concurrent verify-email calls for the same token: exactly one succeeds", async () => {
    const email = `verify-race-${Math.random().toString(36).slice(2)}@example.com`;
    await auth.register({ email, password: "a-strong-password" });
    const user = await db.prisma.user.findUniqueOrThrow({ where: { email } });
    const tokenRow = await db.prisma.accountActionToken.findFirstOrThrow({
      where: { userId: user.id, purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION, consumedAt: null },
    });

    // The real plaintext token was only ever returned once, in the (never
    // persisted) email send — it can't be re-derived from the stored hash.
    // Requesting a second token would be the wrong shape too (issuing a new
    // one invalidates the last), so instead this overwrites the real row's
    // hash with an independently-known plaintext's hash, then races two
    // consumptions of *that* — same table, same conditional UPDATE, same
    // race the real flow relies on.
    const plaintext = generateAccountActionToken();
    await db.prisma.accountActionToken.update({
      where: { id: tokenRow.id },
      data: { tokenHash: hashAccountActionToken(plaintext) },
    });

    const results = await Promise.allSettled([
      auth.verifyEmail({ token: plaintext }),
      auth.verifyEmail({ token: plaintext }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const verifiedUser = await db.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(verifiedUser.emailVerifiedAt).not.toBeNull();
  });
});
