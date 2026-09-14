// The single place User.email is normalized before every write or lookup —
// register, login, forgot-password, resend-verification, Google
// find-or-create, and admin user creation all funnel through this (directly,
// or via normalized-email.schema.ts). No case-insensitive collation
// (citext) exists on the column, so normalization is entirely
// application-level; the 20260914083639_normalize_user_email_case migration
// backfilled existing rows to match this exact transform.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
