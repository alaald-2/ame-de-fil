import { Module } from "@nestjs/common";
import { ShippingModule } from "../shipping/shipping.module.ts";
import { PaymentsModule } from "../payments/payments.module.ts";
import { CheckoutController } from "./checkout.controller.ts";
import { AdminCheckoutController } from "./admin-checkout.controller.ts";
import { CheckoutService } from "./checkout.service.ts";
import { ReservationExpiryService } from "./reservation-expiry.service.ts";

// Checkout orchestration — server-side cart validation, price/VAT/shipping
// recalculation, stock reservation, order-draft + Payment-boundary creation,
// idempotency (ARCHITECTURE.md §3, DATABASE.md §4). Depends on
// ShippingModule/PaymentsModule only through their exported provider
// tokens (SHIPPING_PROVIDER/PAYMENT_PROVIDER) — never a concrete adapter.
@Module({
  imports: [ShippingModule, PaymentsModule],
  controllers: [CheckoutController, AdminCheckoutController],
  providers: [CheckoutService, ReservationExpiryService],
})
export class CheckoutModule {}
