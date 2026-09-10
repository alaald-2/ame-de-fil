import { Injectable } from "@nestjs/common";
import { Prisma } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";

export interface RecordAuditEntryInput {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ipAddress?: string;
}

// Append-only writes only (SECURITY.md §9/audit.module.ts) — nothing here
// ever reads, updates, or deletes an AuditLog row. Takes an optional open
// transaction client so a caller mid-`$transaction` can record the entry
// atomically with the mutation itself: if the write that's being audited
// rolls back, the audit entry must never survive it, and vice versa —
// deliberately not swallowed/best-effort the way NotificationsService's
// email dispatch is, since a mutation whose audit entry silently failed to
// write is exactly the gap this module exists to close.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: RecordAuditEntryInput,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await client.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        before: input.before ?? Prisma.JsonNull,
        after: input.after ?? Prisma.JsonNull,
        ipAddress: input.ipAddress ?? null,
      },
    });
  }
}
