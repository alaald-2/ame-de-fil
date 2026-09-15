import type { operations } from "./generated/api-schema.ts";

// Deliberately minimal (PAYMENTS.md §4, DECISIONS.md ADR-024) — mirrors
// apps/api's orderStatusResponseSchema exactly, generated rather than
// hand-typed so it can never drift from the real response shape.
export type OrderStatusResponse =
  operations["OrdersController_getStatus"]["responses"][200]["content"]["application/json"];

// Same generated-not-hand-typed reasoning as OrderStatusResponse above —
// mirrors apps/api's listMyOrdersResponseSchema/myOrderDetailResponseSchema.
export type ListMyOrdersResponse =
  operations["OrdersController_listMine"]["responses"][200]["content"]["application/json"];
export type MyOrderDetailResponse =
  operations["OrdersController_getMine"]["responses"][200]["content"]["application/json"];
