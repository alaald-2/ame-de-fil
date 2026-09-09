import type { operations } from "./generated/api-schema.ts";

export type ShippingMethodListResponse =
  operations["ShippingController_list"]["responses"][200]["content"]["application/json"];
export type ShippingMethod = ShippingMethodListResponse[number];
