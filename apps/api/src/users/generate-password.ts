import { randomBytes } from "node:crypto";

// Same primitive SessionService.createSession already uses for opaque
// session/CSRF tokens (randomBytes + base64url) — a machine-generated,
// one-time credential doesn't benefit from a "must contain a digit/symbol"
// composition rule (nobody types or memorizes it), only from entropy.
// 18 bytes = 144 bits, comfortably beyond anything Argon2id's own cost
// factor needs to matter for brute-forcing.
const PASSWORD_BYTES = 18;

export function generateInitialPassword(): string {
  return randomBytes(PASSWORD_BYTES).toString("base64url");
}
