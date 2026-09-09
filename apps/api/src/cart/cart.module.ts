import { Module } from "@nestjs/common";
import { CartController } from "./cart.controller.ts";
import { CartService } from "./cart.service.ts";

// Cart/CartItem (ARCHITECTURE.md §3): guest + authenticated cart CRUD. No
// checkout/reservation here — see cart.service.ts's module-level notes.
@Module({
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
