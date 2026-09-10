import { Module } from "@nestjs/common";
import { AuditService } from "./audit.service.ts";

// Append-only AuditLog writes (SECURITY.md §9), wired into the admin
// mutations that already exist (admin/products, admin/inventory,
// admin/orders, admin/checkout) — see each module's own AuditService call
// sites for what's recorded.
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
