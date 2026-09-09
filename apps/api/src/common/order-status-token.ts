import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32; // 256 bits — same primitive/length as SessionService's session tokens.

// Guest order-status polling credential (PAYMENTS.md §4, DECISIONS.md
// ADR-024). Deliberately *not* the same storage convention as
// Session.id: a session token is looked up by an httpOnly cookie the
// browser never exposes to JS, but this token travels in a request header
// set by client-side code and is handed back to the customer once in a
// JSON response body — a plaintext-at-rest bearer credential is a real risk
// here in a way it isn't for the cookie-only session token, so only the
// SHA-256 hash is ever persisted. A fast, unsalted hash is correct (not
// Argon2/bcrypt): the token itself already carries 256 bits of entropy, so
// the hash's job is only "don't store the raw secret," not "resist
// brute-forcing a low-entropy input."
export function generateOrderStatusToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashOrderStatusToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
