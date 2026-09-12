import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserStatus } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import { PasswordService } from "../identity/password.service.ts";
import { SessionService } from "../identity/session.service.ts";
import { isUniqueConstraintViolation } from "../checkout/prisma-errors.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import {
  ADMIN_USER_DETAIL_SELECT,
  ADMIN_USER_LIST_SELECT,
  mapAdminUserDetail,
  mapAdminUserListItem,
} from "./mappers/admin-user.mapper.ts";
import { isSelfTarget, permissionsAreSubsetOfActor, ROLE_MANAGEMENT_GATE_PERMISSION } from "./rbac-guard.ts";
import { generateInitialPassword } from "./generate-password.ts";
import type { CreateUserInput } from "./dto/create-user.dto.ts";
import type { AdminUserDetailResponse, CreateUserResponse } from "./dto/admin-user-responses.ts";

const USER_NOT_FOUND = () => new NotFoundException({ error: "UserNotFound", message: "User not found" });
const ROLE_NOT_FOUND = () => new NotFoundException({ error: "RoleNotFound", message: "Role not found" });

const CANNOT_MODIFY_SELF = (message: string) =>
  new ForbiddenException({ error: "CannotModifySelf", message });

const EXCEEDS_OWN_GRANT = () =>
  new ForbiddenException({
    error: "ExceedsOwnGrant",
    message: "You cannot grant a role containing permissions you do not hold yourself",
  });

const LAST_ROLE_MANAGER_PROTECTED = () =>
  new ConflictException({
    error: "LastRoleManagerProtected",
    message: `Cannot remove the last active user who holds "${ROLE_MANAGEMENT_GATE_PERMISSION}"`,
  });

// Admin RBAC/user administration (PRODUCT_SPEC.md §5's "Administration"
// section — distinct from admin-customers.service.ts's "Customers"
// section, which lists every User row for order-history purposes).
// Staff-only by construction throughout the *browsing* surface (list/
// detail): "staff" has no schema concept of its own (no isStaff column,
// per instruction) — it's simply `roles: { some: {} }`, the existing
// UserRole relationship. Mutations that target a specific already-known id
// (activate/deactivate) intentionally do NOT re-apply that filter — only
// assignRole below can promote a non-staff user (id known, e.g. from
// admin-customers) into a staff one in the first place.
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async list(page: number, pageSize: number, q?: string) {
    const where: Prisma.UserWhereInput = {
      roles: { some: {} },
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: ADMIN_USER_LIST_SELECT,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: rows.map(mapAdminUserListItem),
      page,
      pageSize,
      total,
    };
  }

  // Staff-scoped: a non-staff user id 404s here exactly as if it doesn't
  // exist, so this can never be used as a side channel to browse arbitrary
  // customer profiles (that surface is admin-customers.service.ts, gated
  // by its own, deliberately separate `customers.view` permission).
  async getDetail(id: string): Promise<AdminUserDetailResponse> {
    const isStaff = await this.prisma.user.findFirst({
      where: { id, roles: { some: {} } },
      select: { id: true },
    });
    if (!isStaff) throw USER_NOT_FOUND();

    return this.fetchDetailOrThrow(id);
  }

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        permissions: { select: { permission: { select: { key: true } } } },
      },
      orderBy: { name: "asc" },
    });

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions.map((rolePermission) => rolePermission.permission.key),
    }));
  }

  // Password is always server-generated (approved design) — never
  // client-supplied, never persisted or logged in plaintext. It exists in
  // memory only long enough to be hashed and, on success, returned once in
  // the response; a failed creation (e.g. duplicate email) never reaches
  // the `return` below, so it is never exposed or persisted on that path.
  async createUser(
    input: CreateUserInput,
    actor: AuthContext,
    ipAddress?: string,
  ): Promise<CreateUserResponse> {
    const initialRoleIds = input.initialRoleIds ?? [];
    const roles =
      initialRoleIds.length > 0
        ? await this.prisma.role.findMany({
            where: { id: { in: initialRoleIds } },
            select: { id: true, name: true, permissions: { select: { permission: { select: { key: true } } } } },
          })
        : [];
    if (roles.length !== new Set(initialRoleIds).size) throw ROLE_NOT_FOUND();

    const allRequestedPermissionKeys = roles.flatMap((role) =>
      role.permissions.map((rolePermission) => rolePermission.permission.key),
    );
    if (!permissionsAreSubsetOfActor(allRequestedPermissionKeys, actor.permissions)) {
      throw EXCEEDS_OWN_GRANT();
    }

    const generatedPassword = generateInitialPassword();
    const passwordHash = await this.passwords.hash(generatedPassword);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            status: UserStatus.ACTIVE,
          },
        });

        for (const roleId of initialRoleIds) {
          await tx.userRole.create({ data: { userId: user.id, roleId } });
        }

        await this.audit.record(
          {
            actorUserId: actor.userId,
            action: "user.created",
            entityType: "User",
            entityId: user.id,
            after: { email: user.email, status: user.status, initialRoleIds },
            ipAddress,
          },
          tx,
        );

        return user;
      });

      return {
        id: created.id,
        email: created.email,
        firstName: created.firstName,
        lastName: created.lastName,
        status: created.status,
        roles: roles.map((role) => ({ id: role.id, name: role.name })),
        createdAt: created.createdAt.toISOString(),
        generatedPassword,
      };
    } catch (error) {
      if (isUniqueConstraintViolation(error, "User", "email")) {
        throw new ConflictException({ error: "EmailAlreadyExists", message: "A user with this email already exists" });
      }
      throw error;
    }
  }

  async activate(targetUserId: string, actorUserId: string, ipAddress?: string): Promise<AdminUserDetailResponse> {
    await this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetUserId }, select: { id: true, status: true } });
      if (!target) throw USER_NOT_FOUND();

      const updated = await tx.user.updateMany({
        where: { id: targetUserId, status: UserStatus.DISABLED },
        data: { status: UserStatus.ACTIVE },
      });
      if (updated.count === 0) {
        throw new ConflictException({ error: "UserNotDisabled", message: "This user is not currently deactivated" });
      }

      await this.audit.record(
        {
          actorUserId,
          action: "user.activated",
          entityType: "User",
          entityId: targetUserId,
          before: { status: target.status },
          after: { status: UserStatus.ACTIVE },
          ipAddress,
        },
        tx,
      );
    });

    return this.fetchDetailOrThrow(targetUserId);
  }

  // Self-deactivation is blocked outright (approved design) — an admin
  // must never be able to lock themselves out unilaterally. Last-admin
  // protection and the deactivation itself are one transaction, guarded by
  // the same Permission-row lock removeRole uses below — see
  // lockRoleManagementGate's own comment for exactly how that prevents two
  // concurrent deactivations (or a deactivation racing a role removal)
  // from both concluding "someone else still holds it" and jointly
  // leaving zero ACTIVE `users.manage_roles` holders.
  async deactivate(targetUserId: string, actorUserId: string, ipAddress?: string): Promise<AdminUserDetailResponse> {
    if (isSelfTarget(actorUserId, targetUserId)) {
      throw CANNOT_MODIFY_SELF("You cannot deactivate your own account");
    }

    await this.prisma.$transaction(async (tx) => {
      await this.lockRoleManagementGate(tx);

      const target = await tx.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          status: true,
          roles: { select: { role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } } },
        },
      });
      if (!target) throw USER_NOT_FOUND();

      const targetHoldsGate = target.roles.some((userRole) =>
        userRole.role.permissions.some((rp) => rp.permission.key === ROLE_MANAGEMENT_GATE_PERMISSION),
      );
      if (targetHoldsGate && target.status === UserStatus.ACTIVE) {
        const others = await this.countOtherActiveRoleManagers(tx, targetUserId);
        if (others === 0) throw LAST_ROLE_MANAGER_PROTECTED();
      }

      const updated = await tx.user.updateMany({
        where: { id: targetUserId, status: UserStatus.ACTIVE },
        data: { status: UserStatus.DISABLED },
      });
      if (updated.count === 0) {
        throw new ConflictException({ error: "UserAlreadyInactive", message: "This user is already deactivated" });
      }

      await this.sessions.revokeAllSessionsForUser(targetUserId, tx);

      await this.audit.record(
        {
          actorUserId,
          action: "user.deactivated",
          entityType: "User",
          entityId: targetUserId,
          before: { status: target.status },
          after: { status: UserStatus.DISABLED },
          ipAddress,
        },
        tx,
      );
    });

    return this.fetchDetailOrThrow(targetUserId);
  }

  // Target may be any existing user, staff or not (deliberately not
  // staff-scoped) — this is the one operation that can *make* a user
  // staff, e.g. promoting an existing customer account. Two independent
  // checks close the escalation surface: isSelfTarget (self-role-changes
  // are blocked completely, not merely self-escalation — approved design)
  // and permissionsAreSubsetOfActor (an admin can never grant a role
  // containing a permission they do not currently hold themselves, to
  // anyone).
  async assignRole(
    targetUserId: string,
    roleId: string,
    actor: AuthContext,
    ipAddress?: string,
  ): Promise<AdminUserDetailResponse> {
    if (isSelfTarget(actor.userId, targetUserId)) {
      throw CANNOT_MODIFY_SELF("You cannot change your own roles");
    }

    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true, permissions: { select: { permission: { select: { key: true } } } } },
    });
    if (!role) throw ROLE_NOT_FOUND();

    const roleKeys = role.permissions.map((rp) => rp.permission.key);
    if (!permissionsAreSubsetOfActor(roleKeys, actor.permissions)) throw EXCEEDS_OWN_GRANT();

    await this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
      if (!target) throw USER_NOT_FOUND();

      try {
        await tx.userRole.create({ data: { userId: targetUserId, roleId } });
      } catch (error) {
        if (isUniqueConstraintViolation(error, "UserRole", "roleId")) {
          throw new ConflictException({ error: "RoleAlreadyAssigned", message: "This user already holds that role" });
        }
        throw error;
      }

      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: "user.role_assigned",
          entityType: "User",
          entityId: targetUserId,
          after: { roleId, roleName: role.name },
          ipAddress,
        },
        tx,
      );
    });

    return this.fetchDetailOrThrow(targetUserId);
  }

  // Self-role-changes are blocked completely, in either direction — this
  // also protects against an admin engineering their own lockout by
  // mistake, though that is a side effect of the rule, not its purpose.
  // Last-admin protection mirrors deactivate's own — see
  // lockRoleManagementGate.
  async removeRole(
    targetUserId: string,
    roleId: string,
    actorUserId: string,
    ipAddress?: string,
  ): Promise<AdminUserDetailResponse> {
    if (isSelfTarget(actorUserId, targetUserId)) {
      throw CANNOT_MODIFY_SELF("You cannot change your own roles");
    }

    await this.prisma.$transaction(async (tx) => {
      await this.lockRoleManagementGate(tx);

      const target = await tx.user.findUnique({ where: { id: targetUserId }, select: { id: true, status: true } });
      if (!target) throw USER_NOT_FOUND();

      const role = await tx.role.findUnique({
        where: { id: roleId },
        select: { id: true, name: true, permissions: { select: { permission: { select: { key: true } } } } },
      });
      if (!role) throw ROLE_NOT_FOUND();

      const removingGrantsGate = role.permissions.some((rp) => rp.permission.key === ROLE_MANAGEMENT_GATE_PERMISSION);
      if (removingGrantsGate && target.status === UserStatus.ACTIVE) {
        const remainingRoles = await tx.userRole.findMany({
          where: { userId: targetUserId, roleId: { not: roleId } },
          select: { role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } },
        });
        const stillHoldsGateElsewhere = remainingRoles.some((userRole) =>
          userRole.role.permissions.some((rp) => rp.permission.key === ROLE_MANAGEMENT_GATE_PERMISSION),
        );
        if (!stillHoldsGateElsewhere) {
          const others = await this.countOtherActiveRoleManagers(tx, targetUserId);
          if (others === 0) throw LAST_ROLE_MANAGER_PROTECTED();
        }
      }

      const deleted = await tx.userRole.deleteMany({ where: { userId: targetUserId, roleId } });
      if (deleted.count === 0) {
        throw new ConflictException({ error: "RoleNotAssigned", message: "This user does not hold that role" });
      }

      await this.audit.record(
        {
          actorUserId,
          action: "user.role_removed",
          entityType: "User",
          entityId: targetUserId,
          before: { roleId, roleName: role.name },
          ipAddress,
        },
        tx,
      );
    });

    return this.fetchDetailOrThrow(targetUserId);
  }

  private async fetchDetailOrThrow(id: string): Promise<AdminUserDetailResponse> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: ADMIN_USER_DETAIL_SELECT });
    if (!user) throw USER_NOT_FOUND();

    const activeSessionCount = await this.prisma.session.count({
      where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
    });

    return mapAdminUserDetail(user, activeSessionCount);
  }

  private async countOtherActiveRoleManagers(
    tx: Prisma.TransactionClient,
    excludeUserId: string,
  ): Promise<number> {
    return tx.user.count({
      where: {
        id: { not: excludeUserId },
        status: UserStatus.ACTIVE,
        roles: { some: { role: { permissions: { some: { permission: { key: ROLE_MANAGEMENT_GATE_PERMISSION } } } } } },
      },
    });
  }

  // Serializes every concurrent deactivation/role-removal that could
  // possibly reduce the count of ACTIVE users holding
  // ROLE_MANAGEMENT_GATE_PERMISSION through one shared lock point (this
  // permission's own row), mirroring the refund checkpoint's Payment-row
  // lock: whichever transaction acquires it first runs its "count other
  // active holders" read and, if it proceeds, its write, to completion and
  // commits (releasing the lock) *before* the second transaction's own
  // read of that same count ever executes — so the second transaction
  // always sees the first's already-committed effect, never a stale
  // pre-commit view. This is what makes "count other holders, then act"
  // safe despite not being one single guarded UPDATE: without the lock,
  // two concurrent transactions could each independently count the other
  // as "still there" and both proceed, jointly leaving zero.
  //
  // Locked unconditionally at the top of both callers' transactions
  // (deactivate, removeRole) — not only when the target is already known
  // to hold the gate — because that "does the target hold it" read is
  // itself part of what must happen only after the lock is held; reading
  // it first and conditionally locking afterward would leave exactly the
  // TOCTOU gap this lock exists to close.
  private async lockRoleManagementGate(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "Permission" WHERE "key" = ${ROLE_MANAGEMENT_GATE_PERMISSION} FOR UPDATE`,
    );
    // No further handling if this returns zero rows (the permission was
    // never seeded) — nothing can hold a permission that doesn't exist, so
    // the "does the target hold it" checks downstream already short-circuit
    // to "no protection needed" on their own in that state.
  }
}
