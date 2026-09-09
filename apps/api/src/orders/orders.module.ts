import { Module } from "@nestjs/common";
import { OrdersController } from "./orders.controller.ts";
import { OrdersService } from "./orders.service.ts";

// Order/OrderItem, the Order state machine (PAYMENTS.md §3). Only the
// minimal guest/owner status-polling read path exists so far
// (DECISIONS.md ADR-024) — full order lifecycle (detail views, admin
// fulfillment, refunds) is still a later phase.
@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
