import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module.ts";
import { AuditModule } from "../audit/audit.module.ts";
import { PaymentsModule } from "../payments/payments.module.ts";
import { ShippingModule } from "../shipping/shipping.module.ts";
import { OrdersController } from "./orders.controller.ts";
import { OrdersService } from "./orders.service.ts";
import { AdminOrdersController } from "./admin-orders.controller.ts";
import { AdminOrdersService } from "./admin-orders.service.ts";

// Order/OrderItem, the Order state machine (PAYMENTS.md §3). The guest/owner
// status-polling read path (DECISIONS.md ADR-024), admin fulfillment
// (CONFIRMED -> READY_TO_SHIP -> SHIPPED -> DELIVERED, DECISIONS.md
// ADR-029), admin order list/detail (`orders.view`, Phase 5's
// order-management read path), and admin refunds (`orders.refund`) all
// live here. PaymentsModule/ShippingModule are imported only for their
// exported PAYMENT_PROVIDER/SHIPPING_PROVIDER tokens
// (AdminOrdersService.issueRefund/markShipped) — never a concrete provider.
@Module({
  imports: [NotificationsModule, AuditModule, PaymentsModule, ShippingModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, AdminOrdersService],
})
export class OrdersModule {}
