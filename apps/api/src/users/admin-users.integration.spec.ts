// Integration test (TESTING.md §3 — Vitest + Testcontainers, real Postgres).
// Exercises the real, unmocked AdminUsersService against a real database —
// the last-role-manager concurrency guarantee (a SELECT ... FOR UPDATE
// lock on the users.manage_roles Permission row) is exactly the kind of
// thing a mocked Prisma client can't honestly verify.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { UserStatus } from "@ame-de-fil/database";
import { AdminUsersService } from "./admin-users.service.ts";
import { PasswordService } from "../identity/password.service.ts";
import { SessionService } from "../identity/session.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import {
  startTestDatabase,
  stopTestDatabase,
  type TestDatabase,
} from "../test/testcontainers-postgres.ts";

const GATE = "users.manage_roles";

describe("AdminUsersService — real Postgres", () => {
  let db: TestDatabase;
  let service: AdminUsersService;
  let sessions: SessionService;
  let passwords: PasswordService;

  // SessionService needs a ConfigService for SESSION_TTL_HOURS only —
  // stubbed directly rather than booting a real Nest ConfigModule, the
  // same minimal-stub posture other integration specs in this project use
  // for a single-value dependency.
  function makeConfigStub(): ConstructorParameters<typeof SessionService>[1] {
    return { get: () => 24 } as unknown as ConstructorParameters<typeof SessionService>[1];
  }

  beforeAll(async () => {
    db = await startTestDatabase();
    passwords = new PasswordService();
    sessions = new SessionService(db.prisma, makeConfigStub());
    service = new AdminUsersService(db.prisma, passwords, sessions, new AuditService(db.prisma));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase(db);
  });

  async function seedRole(permissionKeys: string[], name = `role-${randomUUID()}`) {
    const role = await db.prisma.role.create({ data: { name } });
    for (const key of permissionKeys) {
      const permission = await db.prisma.permission.upsert({
        where: { key },
        create: { key },
        update: {},
      });
      await db.prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
    }
    return role;
  }

  async function seedStaffUser(
    permissionKeys: string[],
    options: { status?: UserStatus; roleId?: string } = {},
  ) {
    const roleId = options.roleId ?? (await seedRole(permissionKeys)).id;
    const user = await db.prisma.user.create({
      data: {
        email: `staff-${randomUUID()}@example.com`,
        status: options.status ?? UserStatus.ACTIVE,
        roles: { create: { roleId } },
      },
    });
    return { userId: user.id, roleId };
  }

  async function seedCustomer() {
    return db.prisma.user.create({ data: { email: `customer-${randomUUID()}@example.com` } });
  }

  function authFor(userId: string, permissions: string[]): AuthContext {
    return { userId, sessionId: "n/a", csrfToken: "n/a", permissions };
  }

  // Last-admin protection is deliberately global (every ACTIVE holder of
  // users.manage_roles, system-wide) — correct in production, but this
  // file's tests share one un-reset database (same convention as
  // admin-orders.integration.spec.ts), so a *prior* test's own
  // still-ACTIVE gate-holder (e.g. one a "blocked" assertion deliberately
  // left untouched) would otherwise silently satisfy a *later* test's
  // "is there some other active holder" check for the wrong reason. Every
  // test below that asserts an exact gate-holder count calls this first to
  // establish a true zero baseline.
  async function neutralizeExistingGateHolders(): Promise<void> {
    await db.prisma.user.updateMany({
      where: {
        status: UserStatus.ACTIVE,
        roles: { some: { role: { permissions: { some: { permission: { key: GATE } } } } } },
      },
      data: { status: UserStatus.DISABLED },
    });
  }

  describe("list / getDetail / listRoles", () => {
    it("lists only users holding at least one role, never a pure customer", async () => {
      const staff = await seedStaffUser(["orders.view"]);
      const customer = await seedCustomer();

      const result = await service.list(1, 50);

      expect(result.items.map((item) => item.id)).toContain(staff.userId);
      expect(result.items.map((item) => item.id)).not.toContain(customer.id);
    });

    it("404s on a pure customer id, the same as a nonexistent id", async () => {
      const customer = await seedCustomer();
      await expect(service.getDetail(customer.id)).rejects.toThrow(NotFoundException);
      await expect(service.getDetail("nonexistent-id")).rejects.toThrow(NotFoundException);
    });

    it("returns flattened effective permissions and an active session count", async () => {
      const staff = await seedStaffUser(["orders.view", "orders.refund"]);
      const created = await sessions.createSession({ userId: staff.userId });

      const detail = await service.getDetail(staff.userId);

      expect(detail.permissions.sort()).toEqual(["orders.refund", "orders.view"]);
      expect(detail.activeSessionCount).toBe(1);

      await sessions.revokeSession(created.token);
      const afterRevoke = await service.getDetail(staff.userId);
      expect(afterRevoke.activeSessionCount).toBe(0);
    });

    it("lists every seeded role with its permission keys", async () => {
      const role = await seedRole(["customers.view"], `catalog-role-${randomUUID()}`);
      const roles = await service.listRoles();
      const found = roles.find((r) => r.id === role.id);
      expect(found?.permissions).toEqual(["customers.view"]);
    });
  });

  describe("createUser", () => {
    it("creates a user with a server-generated password that actually verifies, and returns it only once", async () => {
      const actorRole = await seedRole(["users.manage"]);
      const actor = await seedStaffUser([], { roleId: actorRole.id });
      const email = `new-${randomUUID()}@example.com`;

      const response = await service.createUser({ email }, authFor(actor.userId, ["users.manage"]));

      expect(response.generatedPassword.length).toBeGreaterThan(0);
      const created = await db.prisma.user.findUniqueOrThrow({ where: { id: response.id } });
      expect(created.passwordHash).not.toBe(response.generatedPassword); // never stored in plaintext
      const verifies = await passwords.verify(created.passwordHash!, response.generatedPassword);
      expect(verifies).toBe(true);

      const auditEntry = await db.prisma.auditLog.findFirst({
        where: { entityType: "User", entityId: response.id },
      });
      expect(JSON.stringify(auditEntry?.after)).not.toContain(response.generatedPassword); // never logged/audited
    });

    it("rejects a duplicate email with 409 and creates no second row", async () => {
      const actor = await seedStaffUser(["users.manage"]);
      const email = `dup-${randomUUID()}@example.com`;
      await service.createUser({ email }, authFor(actor.userId, ["users.manage"]));

      await expect(
        service.createUser({ email }, authFor(actor.userId, ["users.manage"])),
      ).rejects.toThrow(ConflictException);

      const count = await db.prisma.user.count({ where: { email } });
      expect(count).toBe(1);
    });

    it("rejects initialRoleIds exceeding the actor's own permissions, creating no user at all", async () => {
      const actor = await seedStaffUser(["users.manage"]);
      const roleWithRefund = await seedRole(["orders.refund"]);
      const email = `blocked-${randomUUID()}@example.com`;

      await expect(
        service.createUser(
          { email, initialRoleIds: [roleWithRefund.id] },
          authFor(actor.userId, ["users.manage"]), // does not hold orders.refund
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(await db.prisma.user.findUnique({ where: { email } })).toBeNull();
    });

    it("assigns initialRoleIds when the actor holds every permission they grant", async () => {
      const actorRole = await seedRole(["users.manage", "orders.refund"]);
      const actor = await seedStaffUser([], { roleId: actorRole.id });
      const roleToGrant = await seedRole(["orders.refund"]);
      const email = `promoted-${randomUUID()}@example.com`;

      const response = await service.createUser(
        { email, initialRoleIds: [roleToGrant.id] },
        authFor(actor.userId, ["users.manage", "orders.refund"]),
      );

      const roles = await db.prisma.userRole.findMany({ where: { userId: response.id } });
      expect(roles.map((r) => r.roleId)).toEqual([roleToGrant.id]);
    });
  });

  describe("activate / deactivate", () => {
    it("deactivates an active user, revokes their sessions, and 409s on a repeat", async () => {
      const target = await seedStaffUser(["orders.view"]);
      const actor = await seedStaffUser(["users.manage"]);
      const created = await sessions.createSession({ userId: target.userId });

      await service.deactivate(target.userId, actor.userId);

      const updated = await db.prisma.user.findUniqueOrThrow({ where: { id: target.userId } });
      expect(updated.status).toBe(UserStatus.DISABLED);
      const session = await db.prisma.session.findUniqueOrThrow({ where: { id: created.token } });
      expect(session.revokedAt).not.toBeNull();

      // A revoked session must fail live re-validation immediately — the
      // same guarantee SessionAuthGuard relies on in production.
      expect(await sessions.validateSession(created.token)).toBeNull();

      await expect(service.deactivate(target.userId, actor.userId)).rejects.toThrow(
        ConflictException,
      );
    });

    it("blocks self-deactivation", async () => {
      const actor = await seedStaffUser(["users.manage"]);
      await expect(service.deactivate(actor.userId, actor.userId)).rejects.toThrow(
        ForbiddenException,
      );
      const unchanged = await db.prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
      expect(unchanged.status).toBe(UserStatus.ACTIVE);
    });

    it("blocks deactivating the last active holder of users.manage_roles", async () => {
      await neutralizeExistingGateHolders();
      const gateRole = await seedRole([GATE]);
      const lastAdmin = await seedStaffUser([], { roleId: gateRole.id });
      const actor = await seedStaffUser(["users.manage"]);

      await expect(service.deactivate(lastAdmin.userId, actor.userId)).rejects.toThrow(
        ConflictException,
      );
      const unchanged = await db.prisma.user.findUniqueOrThrow({ where: { id: lastAdmin.userId } });
      expect(unchanged.status).toBe(UserStatus.ACTIVE);
    });

    it("allows deactivating a gate-holder when another active gate-holder remains", async () => {
      await neutralizeExistingGateHolders();
      const gateRole = await seedRole([GATE], `gate-role-${randomUUID()}`);
      const admin1 = await seedStaffUser([], { roleId: gateRole.id });
      const admin2 = await seedStaffUser([], { roleId: gateRole.id });

      await service.deactivate(admin1.userId, admin2.userId);

      const updated = await db.prisma.user.findUniqueOrThrow({ where: { id: admin1.userId } });
      expect(updated.status).toBe(UserStatus.DISABLED);
    });

    it("reactivates a disabled user and 409s if it's already active", async () => {
      const target = await seedStaffUser(["orders.view"], { status: UserStatus.DISABLED });
      const actor = await seedStaffUser(["users.manage"]);

      await service.activate(target.userId, actor.userId);
      const updated = await db.prisma.user.findUniqueOrThrow({ where: { id: target.userId } });
      expect(updated.status).toBe(UserStatus.ACTIVE);

      await expect(service.activate(target.userId, actor.userId)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe("assignRole / removeRole", () => {
    it("promotes an existing customer to staff", async () => {
      const customer = await seedCustomer();
      const roleToGrant = await seedRole(["orders.view"]);
      const actorRole = await seedRole(["users.manage_roles", "orders.view"]);
      const actor = await seedStaffUser([], { roleId: actorRole.id });

      await service.assignRole(
        customer.id,
        roleToGrant.id,
        authFor(actor.userId, ["users.manage_roles", "orders.view"]),
      );

      const result = await service.list(1, 50);
      expect(result.items.map((item) => item.id)).toContain(customer.id);
    });

    it("rejects assigning a role containing a permission the actor does not hold, granting nothing", async () => {
      const target = await seedStaffUser(["orders.view"]);
      const roleWithRefund = await seedRole(["orders.refund"]);
      const actor = await seedStaffUser(["users.manage_roles"]);

      await expect(
        service.assignRole(
          target.userId,
          roleWithRefund.id,
          authFor(actor.userId, ["users.manage_roles"]),
        ),
      ).rejects.toThrow(ForbiddenException);

      const roles = await db.prisma.userRole.findMany({
        where: { userId: target.userId, roleId: roleWithRefund.id },
      });
      expect(roles).toHaveLength(0);
    });

    it("blocks assigning a role to yourself", async () => {
      const role = await seedRole(["orders.view"]);
      const actor = await seedStaffUser(["users.manage_roles", "orders.view"]);

      await expect(
        service.assignRole(
          actor.userId,
          role.id,
          authFor(actor.userId, ["users.manage_roles", "orders.view"]),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("409s assigning a role the user already holds", async () => {
      const role = await seedRole(["orders.view"]);
      const target = await seedStaffUser([], { roleId: role.id });
      const actor = await seedStaffUser(["users.manage_roles", "orders.view"]);

      await expect(
        service.assignRole(
          target.userId,
          role.id,
          authFor(actor.userId, ["users.manage_roles", "orders.view"]),
        ),
      ).rejects.toThrow(ConflictException);

      const roles = await db.prisma.userRole.findMany({
        where: { userId: target.userId, roleId: role.id },
      });
      expect(roles).toHaveLength(1);
    });

    it("blocks removing a role from yourself", async () => {
      const role = await seedRole(["orders.view"]);
      const actor = await seedStaffUser([], { roleId: role.id });

      await expect(service.removeRole(actor.userId, role.id, actor.userId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("409s removing a role the user does not hold", async () => {
      const role = await seedRole(["orders.view"]);
      const target = await seedStaffUser(["customers.view"]);
      const actor = await seedStaffUser(["users.manage_roles"]);

      await expect(service.removeRole(target.userId, role.id, actor.userId)).rejects.toThrow(
        ConflictException,
      );
    });

    it("blocks removing the only role granting users.manage_roles from the last active holder", async () => {
      await neutralizeExistingGateHolders();
      const gateRole = await seedRole([GATE]);
      const lastAdmin = await seedStaffUser([], { roleId: gateRole.id });
      // Deliberately does NOT itself hold users.manage_roles: the service
      // layer doesn't check the actor's own permissions (PermissionsGuard
      // does, in production, before this is ever reached) — what matters
      // here is that lastAdmin really is the *only* active gate-holder in
      // the system, which an actor who also held it would falsely satisfy.
      const actor = await seedStaffUser(["users.manage"]);

      await expect(service.removeRole(lastAdmin.userId, gateRole.id, actor.userId)).rejects.toThrow(
        ConflictException,
      );
      const stillHeld = await db.prisma.userRole.findMany({
        where: { userId: lastAdmin.userId, roleId: gateRole.id },
      });
      expect(stillHeld).toHaveLength(1);
    });

    it("allows removing a gate role when the target still holds it via a second role", async () => {
      await neutralizeExistingGateHolders();
      const gateRole1 = await seedRole([GATE], `gate-1-${randomUUID()}`);
      const gateRole2 = await seedRole([GATE], `gate-2-${randomUUID()}`);
      const target = await seedStaffUser([], { roleId: gateRole1.id });
      await db.prisma.userRole.create({ data: { userId: target.userId, roleId: gateRole2.id } });
      const actor = await seedStaffUser(["users.manage"]);

      await service.removeRole(target.userId, gateRole1.id, actor.userId);

      const remaining = await db.prisma.userRole.findMany({ where: { userId: target.userId } });
      expect(remaining.map((r) => r.roleId)).toEqual([gateRole2.id]);
    });

    it("allows removing a gate role when another active user still holds it", async () => {
      await neutralizeExistingGateHolders();
      const gateRole = await seedRole([GATE], `gate-role-${randomUUID()}`);
      const admin1 = await seedStaffUser([], { roleId: gateRole.id });
      const admin2 = await seedStaffUser([], { roleId: gateRole.id });

      await service.removeRole(admin1.userId, gateRole.id, admin2.userId);

      const remaining = await db.prisma.userRole.findMany({
        where: { userId: admin1.userId, roleId: gateRole.id },
      });
      expect(remaining).toHaveLength(0);
    });
  });

  // CONCURRENCY / LAST-ADMIN PROTECTION (approved design requirement):
  // no combination of concurrent deactivate/removeRole calls may ever
  // leave zero ACTIVE users holding users.manage_roles. The shared
  // Permission-row lock (lockRoleManagementGate) must serialize these so
  // exactly one of two mutually-exclusive "last one standing" actions wins.
  describe("last-admin concurrency protection (real Postgres, genuine concurrency)", () => {
    async function countActiveGateHolders(): Promise<number> {
      return db.prisma.user.count({
        where: {
          status: UserStatus.ACTIVE,
          roles: { some: { role: { permissions: { some: { permission: { key: GATE } } } } } },
        },
      });
    }

    it("two concurrent deactivations of the only two active gate-holders: exactly one succeeds", async () => {
      await neutralizeExistingGateHolders();
      const gateRole = await seedRole([GATE], `gate-role-${randomUUID()}`);
      const admin1 = await seedStaffUser([], { roleId: gateRole.id });
      const admin2 = await seedStaffUser([], { roleId: gateRole.id });

      const results = await Promise.allSettled([
        service.deactivate(admin1.userId, admin2.userId),
        service.deactivate(admin2.userId, admin1.userId),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(await countActiveGateHolders()).toBe(1);
    });

    it("two concurrent role-removals of the only two active gate-holders' gate role: exactly one succeeds", async () => {
      await neutralizeExistingGateHolders();
      const gateRole = await seedRole([GATE], `gate-role-${randomUUID()}`);
      const admin1 = await seedStaffUser([], { roleId: gateRole.id });
      const admin2 = await seedStaffUser([], { roleId: gateRole.id });

      const results = await Promise.allSettled([
        service.removeRole(admin1.userId, gateRole.id, admin2.userId),
        service.removeRole(admin2.userId, gateRole.id, admin1.userId),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(await countActiveGateHolders()).toBe(1);
    });

    it("a concurrent deactivation and role-removal racing on the same last two gate-holders: exactly one succeeds", async () => {
      await neutralizeExistingGateHolders();
      const gateRole = await seedRole([GATE], `gate-role-${randomUUID()}`);
      const admin1 = await seedStaffUser([], { roleId: gateRole.id });
      const admin2 = await seedStaffUser([], { roleId: gateRole.id });

      const results = await Promise.allSettled([
        service.deactivate(admin1.userId, admin2.userId),
        service.removeRole(admin2.userId, gateRole.id, admin1.userId),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(await countActiveGateHolders()).toBe(1);
    });
  });
});
