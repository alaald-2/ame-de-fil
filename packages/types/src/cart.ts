import type { operations } from "./generated/api-schema.ts";

export type CartResponse =
  operations["CartController_getCart"]["responses"][200]["content"]["application/json"];
export type CartItem = CartResponse["items"][number];
