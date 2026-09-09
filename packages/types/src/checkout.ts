import type { operations } from "./generated/api-schema.ts";

export type CheckoutResponse =
  operations["CheckoutController_initiate"]["responses"][201]["content"]["application/json"];
export type CheckoutOrderItem = CheckoutResponse["items"][number];
export type InitiateCheckoutRequest =
  operations["CheckoutController_initiate"]["requestBody"]["content"]["application/json"];
