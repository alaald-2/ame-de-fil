import { z } from "zod";

// Length-only (current NIST 800-63B guidance: composition rules — forced
// digits/symbols/mixed-case — measurably push users toward predictable
// patterns without meaningfully raising real entropy). A common-password
// blocklist would be a stronger control than either approach but adds a
// wordlist dependency; deliberately deferred, not silently skipped (see
// DECISIONS.md's new auth ADR).
export const passwordStrengthSchema = z.string().trim().min(10).max(128);
