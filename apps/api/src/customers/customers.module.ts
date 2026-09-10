import { Module } from "@nestjs/common";
import { AdminCustomersController } from "./admin-customers.controller.ts";
import { AdminCustomersService } from "./admin-customers.service.ts";

// Customer profile, address book, notes (ARCHITECTURE.md §3). Read-only
// list/detail (`customers.view`, Phase 5's customer-management read path)
// implemented; address book, notes, and any update/delete remain a later
// phase.
@Module({
  controllers: [AdminCustomersController],
  providers: [AdminCustomersService],
})
export class CustomersModule {}
