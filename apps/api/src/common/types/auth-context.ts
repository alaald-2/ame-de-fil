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
}
