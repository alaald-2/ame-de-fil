import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module.ts";
import { DashboardController } from "./dashboard.controller.ts";
import { DashboardService } from "./dashboard.service.ts";

// Admin dashboard overview (PRODUCT_SPEC.md §5, ROADMAP.md Phase 5) — a
// single read-only, cross-domain aggregate endpoint. InventoryModule is
// imported only for its exported InventoryService.countLowStock (no
// inventory behavior change — a purely additive read method).
@Module({
  imports: [InventoryModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
