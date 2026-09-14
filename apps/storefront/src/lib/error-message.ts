// openapi-fetch types a failed response's `error` as `never` whenever the
// operation's OpenAPI doc has no documented non-2xx response — true for
// every endpoint here (only success responses are declared) — even though
// the API always sends { error, message, ... } on failure (AllExceptionsFilter).
// Narrows at the one boundary that actually reads it, rather than
// documenting every endpoint's error responses just to satisfy this.
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const { message } = error as { message: unknown };
    if (typeof message === "string") return message;
    if (Array.isArray(message) && message.every((m) => typeof m === "string")) {
      return message.join(" ");
    }
  }
  return fallback;
}

// The machine-readable `error` code (e.g. "EmailNotVerified") alongside the
// human message above — for the one caller (checkout-form.tsx) that needs
// to branch UI on which specific error occurred, not just display text.
export function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "error" in error) {
    const { error: code } = error as { error: unknown };
    if (typeof code === "string") return code;
  }
  return undefined;
}
