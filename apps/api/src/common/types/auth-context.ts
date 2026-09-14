// Attached to the request by SessionAuthGuard once a session is validated.
// `permissions` is the flattened set resolved via UserRole -> Role ->
// RolePermission -> Permission (SECURITY.md §2) — PermissionsGuard checks
// against this, never against raw role names, so a route only ever declares
// what it needs ("orders.refund"), not who's allowed to have it.
export interface AuthContext {
  userId: string;
  sessionId: string;
  csrfToken: string;
  permissions: readonly string[];
  // Null/undefined until the customer proves ownership of their password-set
  // email (verify-email or a successful password reset) — orthogonal to
  // UserStatus (SessionService.validateSession already rejects a
  // non-ACTIVE user's session outright; this only gates specific actions,
  // e.g. checkout's EmailVerifiedGuard, for an otherwise-valid session).
  // Always set for a Google-created account (at creation). Optional (not
  // just nullable) so the many existing hand-built AuthContext test
  // literals that predate this field — unrelated to email verification —
  // don't all need updating: EmailVerifiedGuard treats undefined and null
  // identically (both "not verified").
  emailVerifiedAt?: Date | null;
}
