import { Module } from "@nestjs/common";
import { AuditService } from "./audit.service.ts";
import { AdminAuditLogController } from "./admin-audit-log.controller.ts";
import { AdminAuditLogService } from "./admin-audit-log.service.ts";

// Append-only AuditLog writes (SECURITY.md §9), wired into the admin
// mutations that already exist (admin/products, admin/inventory,
// admin/orders, admin/checkout) — see each module's own AuditService call
// sites for what's recorded. GET /admin/audit-log (AdminAuditLogController/
// Service) is the one read path, gated by its own `audit.view` permission —
// deliberately not part of AuditService itself, which stays write-only.
@Module({
  controllers: [AdminAuditLogController],
  providers: [AuditService, AdminAuditLogService],
  exports: [AuditService],
})
export class AuditModule {}
