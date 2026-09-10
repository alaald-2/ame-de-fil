import { describe, expect, it } from "vitest";
import { shouldExposeApiDocs } from "./bootstrap-config.js";

describe("shouldExposeApiDocs", () => {
  it("returns false for production", () => {
    expect(shouldExposeApiDocs("production")).toBe(false);
  });

  it("returns true for development", () => {
    expect(shouldExposeApiDocs("development")).toBe(true);
  });

  it("returns true for test", () => {
    expect(shouldExposeApiDocs("test")).toBe(true);
  });
});
