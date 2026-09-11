"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Link } from "@ame-de-fil/ui";

interface DashboardDateRangeFormProps {
  from: string;
  to: string;
}

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

// `to` is always an *exclusive* upper bound on the backend (DashboardService's
// `{ gte: from, lt: to }`), but the "To" input should show the last day the
// admin actually intended to include. Every `to` this form itself ever
// constructs (below) lands on an exact UTC midnight for exactly this
// reason — so subtracting a day from an exact-midnight value recovers the
// inclusive end date; the only `to` that is never exact midnight is the
// unmodified default ("now"), which is displayed as-is.
function toInclusiveEndDateInputValue(iso: string): string {
  const date = new Date(iso);
  const isExactUtcMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;
  if (isExactUtcMidnight) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

// GET /admin/dashboard already supports an explicit ?from=&to= UTC range
// (ROADMAP.md's Dashboard-metrics entry) — this is the first UI ever
// calling it with one. `from`/`to` are the *resolved* period the page
// already received (whether defaulted or previously chosen), so the
// inputs always reflect what's actually applied, not stale form state.
// Plain native <input type="date"> + a full page navigation (not a
// client-side fetch) — this page has no other client state to preserve,
// and every other list page's own pagination already works the same way
// (a plain ?page= search param, re-rendered server-side).
//
// IMPORTANT: `fromDate`/`toDate` are only ever *seeded* from props on
// mount — a client-side Next.js navigation (e.g. the "Reset" link below)
// re-renders this same component instance with new `from`/`to` props, but
// React does not re-run a `useState` initializer just because props
// changed. The parent (app/(dashboard)/page.tsx) must pass
// `key={`${from}-${to}`}` so a genuinely new resolved period forces a
// remount instead of silently keeping the stale inputs.

export function DashboardDateRangeForm({ from, to }: DashboardDateRangeFormProps) {
  const t = useTranslations("Dashboard.dateRange");
  const router = useRouter();
  const [fromDate, setFromDate] = useState(toDateInputValue(from));
  const [toDate, setToDate] = useState(toInclusiveEndDateInputValue(to));

  // The backend has no cross-field validation (an inverted range just
  // yields an all-zero period, ROADMAP.md's own documented edge case) —
  // this is purely a frontend nicety, not correctness-critical.
  const isValidRange = fromDate <= toDate;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isValidRange) return;
    // Half-open interval on the backend (>= from, < to) — the day *after*
    // the selected end date at UTC midnight includes the whole selected
    // end day, matching DashboardService's own documented boundary.
    const toExclusive = new Date(`${toDate}T00:00:00.000Z`);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    const params = new URLSearchParams({
      from: `${fromDate}T00:00:00.000Z`,
      to: toExclusive.toISOString(),
    });
    router.push(`/?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-neutral-800">{t("fromLabel")}</span>
        <input
          type="date"
          value={fromDate}
          max={toDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="rounded-sm border border-neutral-300 bg-neutral-50 px-3 py-2 font-sans text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-neutral-800">{t("toLabel")}</span>
        <input
          type="date"
          value={toDate}
          min={fromDate}
          onChange={(e) => setToDate(e.target.value)}
          className="rounded-sm border border-neutral-300 bg-neutral-50 px-3 py-2 font-sans text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        />
      </label>
      <Button type="submit" variant="secondary" disabled={!isValidRange}>
        {t("apply")}
      </Button>
      <Link href="/" className="text-sm">
        {t("reset")}
      </Link>
    </form>
  );
}
