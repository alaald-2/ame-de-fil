import { Module } from "@nestjs/common";
import { AddressesController } from "./addresses.controller.ts";
import { AddressesService } from "./addresses.service.ts";

// The customer address book (`Address` model) — its first consumer; no API
// code touched this model before this module (design discussion,
// docs/plans/customer-address-book). Read/write scoped entirely to the
// caller's own userId, never an admin surface.
@Module({
  controllers: [AddressesController],
  providers: [AddressesService],
})
export class AddressesModule {}
