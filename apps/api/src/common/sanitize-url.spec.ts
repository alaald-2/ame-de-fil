import { describe, expect, it } from "vitest";
import { redactSensitiveQueryParams } from "./sanitize-url.ts";

describe("redactSensitiveQueryParams", () => {
  it("replaces a code query parameter's value, keeping the path and other params intact", () => {
    const result = redactSensitiveQueryParams("/api/v1/auth/google/callback?code=SECRET123&state=abc");
    expect(result).toBe("/api/v1/auth/google/callback?code=[REDACTED]&state=abc");
  });

  it("redacts code regardless of its position in the query string", () => {
    expect(redactSensitiveQueryParams("/x?state=abc&code=SECRET123")).toBe("/x?state=abc&code=[REDACTED]");
  });

  it("is case-insensitive on the parameter name", () => {
    expect(redactSensitiveQueryParams("/x?CODE=SECRET123")).toBe("/x?CODE=[REDACTED]");
  });

  it("leaves a URL with no code parameter completely unchanged", () => {
    const url = "/api/v1/health?foo=bar";
    expect(redactSensitiveQueryParams(url)).toBe(url);
  });

  it("leaves a plain path with no query string unchanged", () => {
    expect(redactSensitiveQueryParams("/api/v1/health")).toBe("/api/v1/health");
  });

  it("does not touch a value that merely contains the substring 'code' inside another param name", () => {
    // "postcode" must not be treated as "code" — the regex requires a `?`/`&` boundary immediately before it.
    expect(redactSensitiveQueryParams("/x?postcode=11122")).toBe("/x?postcode=11122");
  });
});
