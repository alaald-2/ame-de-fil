import type { Prisma } from "@ame-de-fil/database";

// Staff-only scope (WHERE clause lives in admin-users.service.ts, not
// here) — never passwordHash/totpSecret/sessions themselves, only a count
// of the latter (added per-query in the service, not via this SELECT,
// since it needs its own `where` on the relation).
export const ADMIN_USER_LIST_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  roles: { select: { role: { select: { id: true, name: true } } } },
} satisfies Prisma.UserSelect;

export type AdminUserListRow = Prisma.UserGetPayload<{ select: typeof ADMIN_USER_LIST_SELECT }>;

export function mapAdminUserListItem(user: AdminUserListRow) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    roles: user.roles.map((userRole) => ({ id: userRole.role.id, name: userRole.role.name })),
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

export const ADMIN_USER_DETAIL_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
  roles: {
    select: {
      role: {
        select: {
          id: true,
          name: true,
          permissions: { select: { permission: { select: { key: true } } } },
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

export type AdminUserDetailRow = Prisma.UserGetPayload<{ select: typeof ADMIN_USER_DETAIL_SELECT }>;

// Flattens Role -> RolePermission -> Permission into a deduplicated set of
// keys, the same shape SessionService.validateSession computes for
// AuthContext — recomputed here read-only for display.
export function flattenEffectivePermissions(roles: AdminUserDetailRow["roles"]): string[] {
  const permissions = new Set<string>();
  for (const userRole of roles) {
    for (const rolePermission of userRole.role.permissions) {
      permissions.add(rolePermission.permission.key);
    }
  }
  return Array.from(permissions);
}

export function mapAdminUserDetail(user: AdminUserDetailRow, activeSessionCount: number) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    roles: user.roles.map((userRole) => ({ id: userRole.role.id, name: userRole.role.name })),
    permissions: flattenEffectivePermissions(user.roles),
    activeSessionCount,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}
