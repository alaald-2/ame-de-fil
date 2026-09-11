// Hand-rolled RFC 4180 writer — this app has no CSV dependency anywhere
// else and this is small/stable enough that adding one isn't worth it
// (same "small local helper over a new dependency" call as format-money.ts
// makes on the admin side).
const UTF8_BOM = "﻿";

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvField).join(","));
  // UTF-8 BOM so Excel renders å/ä/ö correctly instead of guessing the
  // wrong encoding — CRLF line endings, the format most spreadsheet tools
  // expect from a CSV regardless of platform.
  return UTF8_BOM + lines.join("\r\n") + "\r\n";
}
