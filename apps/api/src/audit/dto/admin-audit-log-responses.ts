import { z } from "zod";

// `before`/`after` are genuinely free-form (AuditService.record's callers
// each pass a different shape per action — order status changes, inventory
// deltas, checkout-sweep counts) — z.unknown() reflects that honestly
// rather than pretending a single schema fits every action type.
const adminAuditLogEntryResponseSchema = z.object({
  id: z.string(),
  actorUserId: z.string().nullable(),
  // Resolved from the `actor` relation via an explicit select (never a
  // bare include) — null both when the entry has no actor and when the
  // actor User row has since been deleted (onDelete: SetNull leaves
  // actorUserId itself null too in that case, so this can never disagree
  // with actorUserId being null).
  actorEmail: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const listAdminAuditLogResponseSchema = z.object({
  items: z.array(adminAuditLogEntryResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
