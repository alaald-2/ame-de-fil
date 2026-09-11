import { describe, expect, it } from "vitest";
import { toCsv } from "./csv.ts";

describe("toCsv", () => {
  it("prefixes a UTF-8 BOM and joins rows with CRLF", () => {
    const csv = toCsv(["A", "B"], [["1", "2"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿A,B\r\n1,2\r\n");
  });

  it("quotes a field containing a comma", () => {
    const csv = toCsv(["Name"], [["Doe, Jane"]]);
    expect(csv).toContain('"Doe, Jane"');
  });

  it("quotes a field containing a double quote and doubles it up", () => {
    const csv = toCsv(["Name"], [['6" pipe']]);
    expect(csv).toContain('"6"" pipe"');
  });

  it("quotes a field containing a newline", () => {
    const csv = toCsv(["Note"], [["line one\nline two"]]);
    expect(csv).toContain('"line one\nline two"');
  });

  it("leaves a plain field unquoted", () => {
    const csv = toCsv(["Name"], [["Jane Doe"]]);
    expect(csv).toContain("Jane Doe");
    expect(csv).not.toContain('"Jane Doe"');
  });
});
