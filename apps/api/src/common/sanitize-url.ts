// Single source of truth for "which query parameters are sensitive enough
// to never appear in a log line or an error response" — shared by
// pino-redact.ts (the auto-logged request line) and all-exceptions.filter.ts
// (the separate, hand-constructed error log line and JSON body), so there
// is exactly one list to keep in sync, not two.
const SENSITIVE_QUERY_PARAMS = ["code"];

// Replaces a sensitive query parameter's *value* in place — never removes
// the whole URL — so the path and any other (non-sensitive) query params
// stay useful for debugging. Case-insensitive parameter matching (URL
// query strings are conventionally lowercase, but this shouldn't silently
// stop working if that ever isn't true); the replacement value itself is
// fixed and never derived from user input.
export function redactSensitiveQueryParams(url: string): string {
  return SENSITIVE_QUERY_PARAMS.reduce(
    (result, param) => result.replace(new RegExp(`([?&]${param}=)[^&]*`, "gi"), "$1[REDACTED]"),
    url,
  );
}
