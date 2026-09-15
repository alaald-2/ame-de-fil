import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.ts";
import { InventoryModule } from "../inventory/inventory.module.ts";
import { AdminTasksController } from "./admin-tasks.controller.ts";
import { AdminTasksService } from "./admin-tasks.service.ts";
import { TaskAutomationService } from "./task-automation.service.ts";
import { TaskAutomationScheduler } from "./task-automation.scheduler.ts";

// InventoryModule imported only for its exported InventoryService (reused
// read-only by TaskAutomationService.listLowStock — see that class's own
// comment) — this module never imports/depends on anything from
// admin-orders/payments, since automation reads Order/Refund/Payment
// directly via PrismaService instead.
@Module({
  imports: [AuditModule, InventoryModule],
  controllers: [AdminTasksController],
  providers: [AdminTasksService, TaskAutomationService, TaskAutomationScheduler],
  exports: [AdminTasksService],
})
export class TasksModule {}
