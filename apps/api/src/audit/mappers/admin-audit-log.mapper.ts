import type { Prisma } from "@ame-de-fil/database";

// Only the actor's email is ever selected off the `actor` relation — never
// a bare include — so a password hash or TOTP secret can't reach this
// response even if the User model gains fields later (same discipline as
// orders/mappers/admin-order.mapper.ts's CUSTOMER_SELECT).
export const ADMIN_AUDIT_LOG_SELECT = {
  id: true,
  actorUserId: true,
  actor: { select: { email: true } },
  action: true,
  entityType: true,
  entityId: true,
  before: true,
  after: true,
  ipAddress: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

export type AdminAuditLogRow = Prisma.AuditLogGetPayload<{ select: typeof ADMIN_AUDIT_LOG_SELECT }>;

export function mapAdminAuditLogEntry(entry: AdminAuditLogRow) {
  return {
    id: entry.id,
    actorUserId: entry.actorUserId,
    actorEmail: entry.actor?.email ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before,
    after: entry.after,
    ipAddress: entry.ipAddress,
    createdAt: entry.createdAt.toISOString(),
  };
}
