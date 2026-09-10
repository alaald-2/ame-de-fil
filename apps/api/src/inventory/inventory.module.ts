import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.ts";
import { InventoryController } from "./inventory.controller.ts";
import { InventoryService } from "./inventory.service.ts";

// Stock + movements (ARCHITECTURE.md §3, DATABASE.md §4): admin-only
// read/adjust endpoints. Reservation-at-checkout is a later phase and does
// not live here yet.
@Module({
  imports: [AuditModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
