import { randomBytes } from "node:crypto";

const SUFFIX_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids misreads on a printed receipt

// Human-readable, distinct from the cuid `id` — e.g. "AF-20260909-7K4QXZ2M".
// Collisions are astronomically unlikely (8 chars from a 32-symbol
// alphabet ≈ 1 in 1e12 per day) but not impossible, so callers retry with a
// freshly generated number on a unique-constraint conflict rather than
// treating one as fatal.
export function generateOrderNumber(now: Date = new Date()): string {
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const bytes = randomBytes(8);
  let suffix = "";
  for (const byte of bytes) {
    suffix += SUFFIX_ALPHABET[byte % SUFFIX_ALPHABET.length];
  }
  return `AF-${datePart}-${suffix}`;
}
