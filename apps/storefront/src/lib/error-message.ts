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
