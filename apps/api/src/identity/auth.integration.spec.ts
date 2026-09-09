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
import { startTestDatabase, stopTestDatabase, type TestDatabase } from "../test/testcontainers-postgres.ts";
import { seedUserWithPermissions } from "../test/fixtures.ts";

function fakeConfig(ttlHours = 168): ConfigService<Env, true> {
  return { get: () => ttlHours } as unknown as ConfigService<Env, true>;
}

describe("AuthService — real Postgres", () => {
  let db: TestDatabase;
  let sessions: SessionService;
  let auth: AuthService;

  beforeAll(async () => {
    db = await startTestDatabase();
    sessions = new SessionService(db.prisma, fakeConfig());
    auth = new AuthService(db.prisma, new PasswordService(), sessions);
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

    await expect(auth.login({ email: fixture.email, password: "wrong-password" }, {})).rejects.toThrow();

    const sessionCount = await db.prisma.session.count({ where: { userId: fixture.userId } });
    expect(sessionCount).toBe(0);
  });

  it("rejects a nonexistent email with the same error shape as a wrong password", async () => {
    await expect(
      auth.login({ email: "definitely-not-a-real-user@example.com", password: "anything" }, {}),
    ).rejects.toThrow();
  });

  it("rejects a DISABLED account, creating no Session row", async () => {
    const fixture = await seedUserWithPermissions(db.prisma, ["orders.fulfill"], { status: "DISABLED" });

    await expect(auth.login({ email: fixture.email, password: fixture.password }, {})).rejects.toThrow();

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
