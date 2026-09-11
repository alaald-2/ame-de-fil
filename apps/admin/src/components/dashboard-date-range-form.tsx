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

// GET /admin/dashboard already supports an explicit ?from=&to= UTC range
// (ROADMAP.md's Dashboard-metrics entry) — this is the first UI ever
// calling it with one. `from`/`to` are the *resolved* period the page
// already received (whether defaulted or previously chosen), so the
// inputs always reflect what's actually applied, not stale form state.
// Plain native <input type="date"> + a full page navigation (not a
// client-side fetch) — this page has no other client state to preserve,
// and every other list page's own pagination already works the same way
// (a plain ?page= search param, re-rendered server-side).
export function DashboardDateRangeForm({ from, to }: DashboardDateRangeFormProps) {
  const t = useTranslations("Dashboard.dateRange");
  const router = useRouter();
  const [fromDate, setFromDate] = useState(toDateInputValue(from));
  const [toDate, setToDate] = useState(toDateInputValue(to));

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
