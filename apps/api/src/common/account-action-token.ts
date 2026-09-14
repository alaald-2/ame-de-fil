import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32; // 256 bits — same primitive/length as SessionService's session tokens and order-status-token.ts.

// Email-verification / password-reset bearer credential (schema.prisma's
// AccountActionToken). Same rationale as order-status-token.ts: a plaintext
// bearer token traveling in an email link is a real at-rest risk, so only
// the SHA-256 hash is ever persisted; a fast, unsalted hash is correct here
// too, since the token itself already carries 256 bits of entropy.
export function generateAccountActionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashAccountActionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
