// Turns an audit-log entry's free-form before/after JSON (AuditService.record
// has no fixed schema — apps/api/src/audit/dto/admin-audit-log-responses.ts
// deliberately types both as z.unknown()) into readable "Field: old → new"
// rows, without discarding any key it doesn't specifically recognize —
// exactly what actually appears across every real audit.record() call site
// in apps/api/src (users/orders/inventory/catalog/checkout) as of this
// checkpoint, plus a generic fallback for anything added later.

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface AuditDiffRow {
  key: string;
  before: JsonValue | undefined;
  after: JsonValue | undefined;
}

function isPlainObject(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// roleId/roleName always appear together (assign/remove role) — the id is
// an opaque database key with no audit value once the name is shown, so
// they collapse to one "role" row keyed by name. Nothing is deleted from
// the underlying record (the API response is untouched); this only chooses
// which of two redundant fields to surface first in the summary.
function collapseRolePair(obj: Record<string, JsonValue>): Record<string, JsonValue> {
  if (typeof obj.roleName !== "string") return obj;
  const { roleId: _roleId, roleName, ...rest } = obj;
  return { ...rest, role: roleName };
}

export function diffAuditPayload(before: unknown, after: unknown): AuditDiffRow[] {
  const b = collapseRolePair(isPlainObject(before) ? before : {});
  const a = collapseRolePair(isPlainObject(after) ? after : {});
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
  return keys.map((key) => ({ key, before: b[key], after: a[key] }));
}

// Generic camelCase -> "Title case" fallback for any field this checkpoint's
// translated dictionary (audit-change-summary.tsx) doesn't recognize —
// still readable, never raw JSON, even for a field added after this ships.
export function humanizeFieldNameFallback(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatJsonValue(value: JsonValue | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    const parts = value.map((item) => formatJsonValue(item)).filter((item): item is string => item !== null);
    return parts.length > 0 ? parts.join(", ") : null;
  }
  // One level of nested-object flattening (e.g. product.created's
  // `translations: [{ locale, name, slug }]`) — still no raw JSON syntax,
  // still every value visible.
  const entries = Object.entries(value)
    .map(([k, v]) => {
      const formatted = formatJsonValue(v);
      return formatted !== null ? `${humanizeFieldNameFallback(k)}: ${formatted}` : null;
    })
    .filter((entry): entry is string => entry !== null);
  return entries.length > 0 ? entries.join(", ") : null;
}
