import { z } from "zod";

const adminUserRoleSummarySchema = z.object({ id: z.string(), name: z.string() });

// Staff-only by construction (admin-users.service.ts filters to
// `roles: { some: {} }`, the existing UserRole relationship — no isStaff
// column) — never passwordHash/totpSecret/sessions, same posture as
// admin-customers' own response, which this deliberately does not
// duplicate (that one lists every User row for order-history purposes;
// this one is scoped to accounts that can reach the admin API at all).
const adminUserListItemResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  status: z.string(),
  roles: z.array(adminUserRoleSummarySchema),
  createdAt: z.iso.datetime(),
  lastLoginAt: z.iso.datetime().nullable(),
});

export const listAdminUsersResponseSchema = z.object({
  items: z.array(adminUserListItemResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

// permissions is the flattened, deduplicated effective set (Role ->
// RolePermission -> Permission) — the same shape SessionService.
// validateSession computes for AuthContext, recomputed here read-only for
// display rather than reusing that method (this has no session to
// validate, just a user id to inspect).
export const adminUserDetailResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  status: z.string(),
  roles: z.array(adminUserRoleSummarySchema),
  permissions: z.array(z.string()),
  activeSessionCount: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lastLoginAt: z.iso.datetime().nullable(),
});
export type AdminUserDetailResponse = z.infer<typeof adminUserDetailResponseSchema>;

// generatedPassword is present only in this one response, only on success
// (admin-users.service.ts never persists or logs it) — the sole delivery
// channel for it, since no invitation/email flow exists (approved design).
export const createUserResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  status: z.string(),
  roles: z.array(adminUserRoleSummarySchema),
  createdAt: z.iso.datetime(),
  generatedPassword: z.string(),
});
export type CreateUserResponse = z.infer<typeof createUserResponseSchema>;

const adminRoleResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  permissions: z.array(z.string()),
});

export const listAdminRolesResponseSchema = z.array(adminRoleResponseSchema);
