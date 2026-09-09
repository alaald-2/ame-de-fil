import { Module } from "@nestjs/common";
import { OrdersController } from "./orders.controller.ts";
import { OrdersService } from "./orders.service.ts";
import { AdminOrdersController } from "./admin-orders.controller.ts";
import { AdminOrdersService } from "./admin-orders.service.ts";

// Order/OrderItem, the Order state machine (PAYMENTS.md §3). The guest/owner
// status-polling read path (DECISIONS.md ADR-024) and admin fulfillment
// (CONFIRMED -> READY_TO_SHIP -> SHIPPED -> DELIVERED, DECISIONS.md
// ADR-029) both live here. Detail views and refunds remain a later phase.
@Module({
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, AdminOrdersService],
})
export class OrdersModule {}
