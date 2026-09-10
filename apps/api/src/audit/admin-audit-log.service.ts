import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.ts";
import { ADMIN_AUDIT_LOG_SELECT, mapAdminAuditLogEntry } from "./mappers/admin-audit-log.mapper.ts";

// Deliberately a separate service from AuditService (audit.service.ts),
// not a `list` method added there — AuditService's own header comment is
// an explicit "nothing here ever reads" contract for the write path every
// other module depends on, and this is the one read path, gated by its
// own `audit.view` permission at the controller (AuditService's callers
// never need read access, only write).
@Injectable()
export class AdminAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(page: number, pageSize: number) {
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        select: ADMIN_AUDIT_LOG_SELECT,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count(),
    ]);

    return {
      items: rows.map(mapAdminAuditLogEntry),
      page,
      pageSize,
      total,
    };
  }
}
