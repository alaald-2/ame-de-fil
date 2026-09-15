import type { operations } from "./generated/api-schema.ts";

// Same generated-not-hand-typed reasoning as orders.ts's own exports —
// mirrors apps/api's addressResponseSchema/listAddressesResponseSchema.
export type AddressResponse =
  operations["AddressesController_getOne"]["responses"][200]["content"]["application/json"];
export type ListAddressesResponse =
  operations["AddressesController_list"]["responses"][200]["content"]["application/json"];
