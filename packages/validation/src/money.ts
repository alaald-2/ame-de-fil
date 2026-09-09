import { z } from "zod";
import { currencySchema } from "./currency.ts";

// Minor units (öre), never floats (DATABASE.md §5). Shape validation only — this
// schema never certifies that an amount is *correct* for a given order; server-side
// business logic re-derives the real amount from the database on every request
// (PAYMENTS.md §1).
export const moneySchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: currencySchema,
});
export type Money = z.infer<typeof moneySchema>;
