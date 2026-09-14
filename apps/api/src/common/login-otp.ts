import { createHash, randomInt } from "node:crypto";

const CODE_DIGITS = 6;
const CODE_MAX_EXCLUSIVE = 10 ** CODE_DIGITS; // 1,000,000 — 6 digits, zero-padded

// Cryptographically secure (node:crypto.randomInt, never Math.random) —
// entropy here is deliberately small (6 human-typed digits), so the real
// defenses are LoginOtp's attempts counter, short TTL, and the resend
// cooldown, not the code's own unguessability (see schema.prisma's
// LoginOtp comment).
export function generateLoginOtpCode(): string {
  return randomInt(0, CODE_MAX_EXCLUSIVE).toString().padStart(CODE_DIGITS, "0");
}

export function hashLoginOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
