import type { operations } from "./generated/api-schema.ts";

export type ShippingMethodListResponse =
  operations["ShippingController_list"]["responses"][200]["content"]["application/json"];
export type ShippingMethod = ShippingMethodListResponse[number];

export type PickupPointListResponse =
  operations["ShippingController_listPickupPoints"]["responses"][200]["content"]["application/json"];
export type PickupPoint = PickupPointListResponse[number];
