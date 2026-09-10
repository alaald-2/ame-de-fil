import { describe, expect, it, vi } from "vitest";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma, UserStatus } from "@ame-de-fil/database";
import { AdminUsersService } from "./admin-users.service.ts";
import type { PrismaService } from "../database/prisma.service.ts";
import type { PasswordService } from "../identity/password.service.ts";
import type { SessionService } from "../identity/session.service.ts";
import type { AuditService } from "../audit/audit.service.ts";
import type { AuthContext } from "../common/types/auth-context.ts";

const ACTOR = "actor-1";
const TARGET = "target-1";

function authFor(userId: string, permissions: string[]): AuthContext {
  return { userId, sessionId: "session-1", csrfToken: "csrf-1", permissions };
}

// Mirrors admin-orders.service.spec.ts's makePrismaMock idiom: `tx` exposes
// the same nested mocks as `prisma`, so overrides configured on `prisma`
// are exactly what the $transaction callback sees.
function makePrismaMock(overrides: Record<string, unknown> = {}) {
  const userFindMany = vi.fn().mockResolvedValue([]);
  const userCount = vi.fn().mockResolvedValue(0);
  const userFindFirst = vi.fn().mockResolvedValue(null);
  // Also stands in for fetchDetailOrThrow's own final re-fetch (every
  // mutation method returns its result via that call) — a complete shape
  // by default so a test overriding just the *first* lookup within its own
  // transaction only needs mockResolvedValueOnce, not to also fabricate a
  // full detail-shaped row it doesn't care about asserting on.
  const userFindUnique = vi.fn().mockResolvedValue({
    id: TARGET,
    email: "target@example.com",
    firstName: null,
    lastName: null,
    status: UserStatus.ACTIVE,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    lastLoginAt: null,
    roles: [],
  });
  const userCreate = vi.fn();
  const userUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const roleFindMany = vi.fn().mockResolvedValue([]);
  const roleFindUnique = vi.fn().mockResolvedValue({ id: "role-1", name: "role-1", permissions: [] });
  const userRoleCreate = vi.fn().mockResolvedValue({});
  const userRoleDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
  const userRoleFindMany = vi.fn().mockResolvedValue([]);
  const sessionCount = vi.fn().mockResolvedValue(0);
  const queryRaw = vi.fn().mockResolvedValue([{ id: "permission-1" }]);

  const prisma: Record<string, unknown> = {
    user: {
      findMany: userFindMany,
      count: userCount,
      findFirst: userFindFirst,
      findUnique: userFindUnique,
      create: userCreate,
      updateMany: userUpdateMany,
    },
    role: { findMany: roleFindMany, findUnique: roleFindUnique },
    userRole: { create: userRoleCreate, deleteMany: userRoleDeleteMany, findMany: userRoleFindMany },
    session: { count: sessionCount },
    $queryRaw: queryRaw,
    ...overrides,
  };
  prisma["$transaction"] = vi
    .fn()
    .mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({
        user: prisma["user"],
        role: prisma["role"],
        userRole: prisma["userRole"],
        session: prisma["session"],
        $queryRaw: prisma["$queryRaw"],
      }),
    );

  return {
    prisma: prisma as unknown as PrismaService,
    userFindMany,
    userCount,
    userFindFirst,
    userFindUnique,
    userCreate,
    userUpdateMany,
    roleFindMany,
    roleFindUnique,
    userRoleCreate,
    userRoleDeleteMany,
    userRoleFindMany,
    sessionCount,
    queryRaw,
  };
}

function makePasswordsMock() {
  return { hash: vi.fn().mockResolvedValue("argon2id-hash") } as unknown as PasswordService & {
    hash: ReturnType<typeof vi.fn>;
  };
}

function makeSessionsMock() {
  return { revokeAllSessionsForUser: vi.fn().mockResolvedValue(undefined) } as unknown as SessionService & {
    revokeAllSessionsForUser: ReturnType<typeof vi.fn>;
  };
}

function makeAuditMock() {
  return { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService & {
    record: ReturnType<typeof vi.fn>;
  };
}

function makeUserRolePkViolation() {
  return new Prisma.PrismaClientKnownRequestError("duplicate key value violates unique constraint", {
    code: "P2002",
    clientVersion: "test",
    meta: {
      modelName: "UserRole",
      driverAdapterError: { cause: { constraint: { index: "UserRole_pkey" }, table: "UserRole" } },
    },
  });
}

describe("AdminUsersService.assignRole", () => {
  it("rejects a self-targeted role change without ever looking up the role", async () => {
    const { prisma, roleFindUnique } = makePrismaMock();
    const service = new AdminUsersService(prisma, makePasswordsMock(), makeSessionsMock(), makeAuditMock());

    await expect(service.assignRole(ACTOR, "role-1", authFor(ACTOR, []))).rejects.toThrow(ForbiddenException);
    expect(roleFindUnique).not.toHaveBeenCalled();
  });

  it("rejects granting a role containing a permission the actor does not hold", async () => {
    const { prisma, roleFindUnique } = makePrismaMock();
    roleFindUnique.mockResolvedValue({
      id: "role-1",
      name: "role-1",
      permissions: [{ permission: { key: "orders.refund" } }],
    });
    const service = new AdminUsersService(prisma, makePasswordsMock(), makeSessionsMock(), makeAuditMock());

    await expect(
      service.assignRole(TARGET, "role-1", authFor(ACTOR, ["orders.view"])),
    ).rejects.toThrow(ForbiddenException);
  });

  it("throws RoleNotFound when the role does not exist", async () => {
    const { prisma, roleFindUnique } = makePrismaMock();
    roleFindUnique.mockResolvedValue(null);
    const service = new AdminUsersService(prisma, makePasswordsMock(), makeSessionsMock(), makeAuditMock());

    await expect(service.assignRole(TARGET, "missing-role", authFor(ACTOR, []))).rejects.toThrow(NotFoundException);
  });

  it("throws UserNotFound when the target user does not exist", async () => {
    const { prisma, userFindUnique } = makePrismaMock();
    userFindUnique.mockResolvedValue(null);
    const service = new AdminUsersService(prisma, makePasswordsMock(), makeSessionsMock(), makeAuditMock());

    await expect(
      service.assignRole(TARGET, "role-1", authFor(ACTOR, ["orders.view"])),
    ).rejects.toThrow(NotFoundException);
  });

  it("creates the UserRole row and records an audit entry on success", async () => {
    const { prisma, userRoleCreate } = makePrismaMock();
    const audit = makeAuditMock();
    const service = new AdminUsersService(prisma, makePasswordsMock(), makeSessionsMock(), audit);

    await service.assignRole(TARGET, "role-1", authFor(ACTOR, []));

    expect(userRoleCreate).toHaveBeenCalledWith({ data: { userId: TARGET, roleId: "role-1" } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: ACTOR, action: "user.role_assigned", entityType: "User", entityId: TARGET }),
      expect.anything(),
    );
  });

  it("returns RoleAlreadyAssigned (409) on a real UserRole primary-key violation", async () => {
    const { prisma, userRoleCreate } = makePrismaMock();
    userRoleCreate.mockRejectedValue(makeUserRolePkViolation());
    const service = new AdminUsersService(prisma, makePasswordsMock(), makeSessionsMock(), makeAuditMock());

    await expect(service.assignRole(TARGET, "role-1", authFor(ACTOR, []))).rejects.toThrow(ConflictException);
  });
});

describe("AdminUsersService.removeRole", () => {
  it("rejects a self-targeted role change", async () => {
    const { prisma } = makePrismaMock();
    const service = new AdminUsersService(prisma, makePasswordsMock(), makeSessionsMock(), makeAuditMock());

    await expect(service.removeRole(ACTOR, "role-1", ACTOR)).rejects.toThrow(ForbiddenException);
  });

  it("blocks removing the last role granting users.manage_roles from the last active holder", async () => {
    const { prisma, userFindUnique, roleFindUnique, userCount } = makePrismaMock();
    userFindUnique.mockResolvedValue({ id: TARGET, status: UserStatus.ACTIVE });
    roleFindUnique.mockResolvedValue({
      id: "role-1",
      name: "admin",
      permissions: [{ permission: { key: "users.manage_roles" } }],
    });
    userCount.mockResolvedValue(0); // no other ACTIVE holder

    const service = new AdminUsersService(prisma, makePasswordsMock(), makeSessionsMock(), makeAuditMock());

    await expect(service.removeRole(TARGET, "role-1", ACTOR)).rejects.toThrow(ConflictException);
  });

  it("allows removal when the target still holds the gate permission via another role", async () => {
    const { prisma, userFindUnique, roleFindUnique, userRoleFindMany, userRoleDeleteMany, userCount } =
      makePrismaMock();
    userFindUnique.mockResolvedValueOnce({ id: TARGET, status: UserStatus.ACTIVE });
    roleFindUnique.mockResolvedValue({
      id: "role-1",
      name: "admin",
      permissions: [{ permission: { key: "users.manage_roles" } }],
    });
    userRoleFindMany.mockResolvedValue([
      { role: { permissions: [{ permission: { key: "users.manage_roles" } }] } },
    ]);

    const service = new AdminUsersService(prisma, makePasswordsMock(), makeSessionsMock(), makeAuditMock());
    await service.removeRole(TARGET, "role-1", ACTOR);

    expect(userCount).not.toHaveBeenCalled(); // never needed the last-holder count at all
    expect(userRoleDeleteMany).toHaveBeenCalledWith({ where: { userId: TARGET, roleId: "role-1" } });
  });

  it("allows removal when another ACTIVE user still holds the gate permission", async () => {
    const { prisma, userFindUnique, roleFindUnique, userCount, userRoleDeleteMany } = makePrismaMock();
    userFindUnique.mockResolvedValueOnce({ id: TARGET, status: UserStatus.ACTIVE });
    roleFindUnique.mockResolvedValue({
      id: "role-1",
      name: "admin",
      permissions: [{ permission: { key: "users.manage_roles" } }],
    });
    userCount.mockResolvedValue(1);

    const service = new AdminUsersService(prisma, makePasswordsMock(), makeSessionsMock(), makeAuditMock());
    await service.removeRole(TARGET, "role-1", ACTOR);

    expect(userRoleDeleteMany).toHaveBeenCalled();
  });

  it("returns RoleNotAssigned (409) when the guarded delete matches nothing", async () => {
    const { prisma, userRoleDeleteMany } = makePrismaMock();
    userRoleDeleteMany.mockResolvedValue({ count: 0 });
    const service = new AdminUsersService(prisma, makePasswordsMock(), makeSessionsMock(), makeAuditMock());

    await expect(service.removeRole(TARGET, "role-1", ACTOR)).rejects.toThrow(ConflictException);
  });
});

describe("AdminUsersService.deactivate", () => {
  it("rejects self-deactivation", async () => {
    const { prisma } = makePrismaMock();
    const service = new AdminUsersService(prisma, makePasswordsMock(), makeSessionsMock(), makeAuditMock());

    await expect(service.deactivate(ACTOR, ACTOR)).rejects.toThrow(ForbiddenException);
  });

  it("blocks deactivating the last active user who holds users.manage_roles", async () => {
    const { prisma, userFindUnique, userCount } = makePrismaMock();
    userFindUnique.mockResolvedValue({
      id: TARGET,
      status: UserStatus.ACTIVE,
      roles: [{ role: { permissions: [{ permission: { key: "users.manage_roles" } }] } }],
    });
    userCount.mockResolvedValue(0);
    const service = new AdminUsersService(prisma, makePasswordsMock(), makeSessionsMock(), makeAuditMock());

    await expect(service.deactivate(TARGET, ACTOR)).rejects.toThrow(ConflictException);
  });

  it("deactivates, revokes sessions, and audits when another gate-holder remains", async () => {
    const { prisma, userFindUnique, userCount, userUpdateMany } = makePrismaMock();
    userFindUnique.mockResolvedValueOnce({
      id: TARGET,
      status: UserStatus.ACTIVE,
      roles: [{ role: { permissions: [{ permission: { key: "users.manage_roles" } }] } }],
    });
    userCount.mockResolvedValue(1);
    const sessions = makeSessionsMock();
    const audit = makeAuditMock();
    const service = new AdminUsersService(prisma, makePasswordsMock(), sessions, audit);

    await service.deactivate(TARGET, ACTOR);

    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: TARGET, status: UserStatus.ACTIVE },
      data: { status: UserStatus.DISABLED },
    });
    expect(sessions.revokeAllSessionsForUser).toHaveBeenCalledWith(TARGET, expect.anything());
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.deactivated", entityType: "User", entityId: TARGET }),
      expect.anything(),
    );
  });

  it("never checks last-admin protection for a target that doesn't hold the gate permission", async () => {
    const { prisma, userFindUnique, userCount } = makePrismaMock();
    userFindUnique.mockResolvedValueOnce({ id: TARGET, status: UserStatus.ACTIVE, roles: [] });
    const service = new AdminUsersService(prisma, makePasswordsMock(), makeSessionsMock(), makeAuditMock());

    await service.deactivate(TARGET, ACTOR);

    expect(userCount).not.toHaveBeenCalled();
  });

  it("returns UserAlreadyInactive (409) when the guarded update matches nothing", async () => {
    const { prisma, userFindUnique, userUpdateMany } = makePrismaMock();
    userFindUnique.mockResolvedValue({ id: TARGET, status: UserStatus.DISABLED, roles: [] });
    userUpdateMany.mockResolvedValue({ count: 0 });
    const service = new AdminUsersService(prisma, makePasswordsMock(), makeSessionsMock(), makeAuditMock());

    await expect(service.deactivate(TARGET, ACTOR)).rejects.toThrow(ConflictException);
  });
});

describe("AdminUsersService.activate", () => {
  it("returns UserNotDisabled (409) when the guarded update matches nothing", async () => {
    const { prisma, userUpdateMany } = makePrismaMock();
    userUpdateMany.mockResolvedValue({ count: 0 });
    const service = new AdminUsersService(prisma, makePasswordsMock(), makeSessionsMock(), makeAuditMock());

    await expect(service.activate(TARGET, ACTOR)).rejects.toThrow(ConflictException);
  });

  it("activates and audits on success", async () => {
    const { prisma, userFindUnique, userUpdateMany } = makePrismaMock();
    userFindUnique.mockResolvedValueOnce({ id: TARGET, status: UserStatus.DISABLED });
    const audit = makeAuditMock();
    const service = new AdminUsersService(prisma, makePasswordsMock(), makeSessionsMock(), audit);

    await service.activate(TARGET, ACTOR);

    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: TARGET, status: UserStatus.DISABLED },
      data: { status: UserStatus.ACTIVE },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.activated" }),
      expect.anything(),
    );
  });
});

describe("AdminUsersService.createUser", () => {
  it("rejects initialRoleIds granting a permission the actor does not hold", async () => {
    const { prisma, roleFindMany } = makePrismaMock();
    roleFindMany.mockResolvedValue([
      { id: "role-1", name: "role-1", permissions: [{ permission: { key: "orders.refund" } }] },
    ]);
    const passwords = makePasswordsMock();
    const service = new AdminUsersService(prisma, passwords, makeSessionsMock(), makeAuditMock());

    await expect(
      service.createUser(
        { email: "new@example.com", initialRoleIds: ["role-1"] },
        authFor(ACTOR, ["orders.view"]),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(passwords.hash).not.toHaveBeenCalled();
  });

  it("throws RoleNotFound when an initialRoleId does not resolve to a real role", async () => {
    const { prisma, roleFindMany } = makePrismaMock();
    roleFindMany.mockResolvedValue([]); // requested one id, found zero
    const service = new AdminUsersService(prisma, makePasswordsMock(), makeSessionsMock(), makeAuditMock());

    await expect(
      service.createUser({ email: "new@example.com", initialRoleIds: ["missing-role"] }, authFor(ACTOR, [])),
    ).rejects.toThrow(NotFoundException);
  });

  it("generates and hashes a password, returns it once, and never logs/persists it in plaintext", async () => {
    const { prisma, userCreate } = makePrismaMock();
    userCreate.mockResolvedValue({
      id: "new-user",
      email: "new@example.com",
      firstName: null,
      lastName: null,
      status: UserStatus.ACTIVE,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const passwords = makePasswordsMock();
    const audit = makeAuditMock();
    const service = new AdminUsersService(prisma, passwords, makeSessionsMock(), audit);

    const result = await service.createUser({ email: "new@example.com" }, authFor(ACTOR, []));

    expect(passwords.hash).toHaveBeenCalledTimes(1);
    const plaintextPasswordArg = passwords.hash.mock.calls[0]?.[0];
    expect(result.generatedPassword).toBe(plaintextPasswordArg); // the response returns exactly what was hashed
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ passwordHash: "argon2id-hash" }) }),
    );
    // The audit "after" payload must never carry the plaintext or its hash.
    const auditCall = audit.record.mock.calls[0]?.[0] as { after?: Record<string, unknown> };
    expect(JSON.stringify(auditCall.after)).not.toContain(result.generatedPassword);
  });

  it("returns EmailAlreadyExists (409) on a real User.email unique violation, without exposing the password", async () => {
    const { prisma, userCreate } = makePrismaMock();
    userCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "test",
        meta: { modelName: "User", driverAdapterError: { cause: { constraint: { index: "User_email_key" }, table: "User" } } },
      }),
    );
    const service = new AdminUsersService(prisma, makePasswordsMock(), makeSessionsMock(), makeAuditMock());

    await expect(service.createUser({ email: "dup@example.com" }, authFor(ACTOR, []))).rejects.toThrow(
      ConflictException,
    );
  });
});
