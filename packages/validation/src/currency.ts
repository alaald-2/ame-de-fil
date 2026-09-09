import { z } from "zod";

// SEK-only for v1 (DECISIONS.md ADR-021). Kept as its own schema, not inlined into
// money.ts, so a future multi-currency change touches one place.
export const currencySchema = z.literal("SEK");
export type Currency = z.infer<typeof currencySchema>;
