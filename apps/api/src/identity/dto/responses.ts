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
});
export type SafeUser = z.infer<typeof safeUserSchema>;

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
