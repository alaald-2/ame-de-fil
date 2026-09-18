"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@ame-de-fil/ui";
import { API_URL } from "../lib/env";

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  // Day 0 of next month is the last day of this month — no separate
  // "days in month" lookup needed.
  const last = new Date(Date.UTC(year, month + 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

function buildExportHref(fromDate: string, toDate: string): string {
  // Half-open interval on the backend (>= from, < to), same convention as
  // dashboard-date-range-form.tsx — the day *after* the selected end date
  // includes the whole selected end day.
  const toExclusive = new Date(`${toDate}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  const params = new URLSearchParams({
    from: `${fromDate}T00:00:00.000Z`,
    to: toExclusive.toISOString(),
  });
  return `${API_URL}/api/v1/admin/orders/export?${params.toString()}`;
}

// GET /admin/orders/export needs no client-side fetch/blob handling — a
// plain anchor tag is the entire implementation. GET requests skip CSRF
// entirely and the SameSite=Lax session cookie is sent on a top-level
// navigation, so the browser's own Content-Disposition handling does the
// rest (confirmed against this app's existing auth/CSRF setup).
export function OrdersExportLink() {
  const t = useTranslations("Orders.export");
  const [range, setRange] = useState(defaultRange);
  const isValidRange = range.from <= range.to;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-neutral-800">{t("fromLabel")}</span>
        <input
          type="date"
          value={range.from}
          max={range.to}
          onChange={(e) => setRange((current) => ({ ...current, from: e.target.value }))}
          className="rounded-sm border border-neutral-300 bg-neutral-50 px-3 py-2 font-sans text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-neutral-800">{t("toLabel")}</span>
        <input
          type="date"
          value={range.to}
          min={range.from}
          onChange={(e) => setRange((current) => ({ ...current, to: e.target.value }))}
          className="rounded-sm border border-neutral-300 bg-neutral-50 px-3 py-2 font-sans text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        />
      </label>
      {isValidRange ? (
        // A real anchor, not a disabled one — an <a> has no native disabled
        // state (Tailwind's disabled: variant only matches a real
        // :disabled element), so the invalid-range case below renders an
        // actual disabled <button> instead of trying to fake it on a link.
        <Button asChild variant="secondary">
          <a href={buildExportHref(range.from, range.to)}>{t("downloadButton")}</a>
        </Button>
      ) : (
        <Button type="button" variant="secondary" disabled>
          {t("downloadButton")}
        </Button>
      )}
    </div>
  );
}
