import { z } from "zod";

// Deliberately excludes passwordHash/totpSecret and any Session
// internals (token, csrfToken lives alongside this, never inside it) —
// this is what a client is ever allowed to see about "who am I"
// (SECURITY.md §1: passwords are never returned in responses).
export const safeUserSchema = z.object({
  id: z.string(),
  email: z.email(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  locale: z.enum(["sv-SE", "en"]),
  permissions: z.array(z.string()),
  emailVerifiedAt: z.iso.datetime().nullable(),
});
export type SafeUser = z.infer<typeof safeUserSchema>;

// Shared by register/resend-verification/forgot-password/reset-password/
// verify-email — every one of these deliberately returns the exact same
// generic shape regardless of outcome (SECURITY.md §1: never reveal account
// existence via response shape).
export const messageResponseSchema = z.object({ message: z.string() });
export type MessageResponse = z.infer<typeof messageResponseSchema>;

// csrfToken is deliberately returned here too, not only set as a cookie
// (see auth.controller.ts) — a caller making server-side requests (SSR)
// can't read the non-httpOnly CSRF cookie itself, so the response body is
// the one delivery mechanism guaranteed to work regardless of how the
// client's HTTP layer handles cookies.
export const loginResponseSchema = z.object({
  user: safeUserSchema,
  csrfToken: z.string(),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const sessionResponseSchema = z.discriminatedUnion("authenticated", [
  z.object({ authenticated: z.literal(true), user: safeUserSchema, csrfToken: z.string() }),
  z.object({ authenticated: z.literal(false) }),
]);
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

// Pure UI-branching hint for the storefront's email-first login screen — no
// side effects, nothing sent. "otp" covers both Google-only and unknown
// emails alike (DECISIONS.md ADR-036): the two are never distinguished here,
// only "has a password" vs. "does not" is ever revealed, the one accepted,
// bounded enumeration signal this flow trades for a progressive-disclosure UX.
export const loginMethodResponseSchema = z.object({ method: z.enum(["password", "otp"]) });
export type LoginMethodResponse = z.infer<typeof loginMethodResponseSchema>;
