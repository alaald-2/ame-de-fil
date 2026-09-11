import { getTranslations, getLocale } from "next-intl/server";
import { Heading, Text, Alert, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../lib/dal";
import { getServerApiClient } from "../../lib/server-api";
import { formatMoney } from "../../lib/format-money";
import { orderStatusTone, paymentStatusTone, refundStatusTone, type BadgeTone } from "../../lib/order-status";
import { DashboardDateRangeForm } from "../../components/dashboard-date-range-form";
import type { AdminLocale } from "../../i18n/config";

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
}

interface StatProps {
  label: string;
  value: string;
  size?: "lg" | "sm";
}

// Quiet label-above-number pairs, not colorful KPI cards — no icons, no
// up/down deltas (the API returns one period's absolute figures, never a
// comparison to a prior period, so a trend arrow here would be invented,
// not real). `size="lg"` reserved for the single most important figure per
// section (net revenue) — DESIGN_SYSTEM.md's display serif used for a large
// figure the way an editorial page uses it for a pull-quote, not a generic
// dashboard's bolded sans-serif number.
function Stat({ label, value, size = "sm" }: StatProps) {
  return (
    <div>
      <Text size="sm" tone="muted" className="text-xs tracking-wide uppercase">
        {label}
      </Text>
      <p
        className={
          size === "lg"
            ? "mt-1 font-display text-4xl text-neutral-900 tabular-nums md:text-5xl"
            : "mt-1 font-sans text-xl text-neutral-900 tabular-nums"
        }
      >
        {value}
      </p>
    </div>
  );
}

interface BreakdownItem {
  label: string;
  count: number;
  tone: BadgeTone;
  amount?: string;
}

// A plain list, not a chart (no charting library — dashboard aggregates
// have no time series to plot, DECISIONS.md's dependency review). Reuses
// the exact same status/tone language as the Orders list/detail pages
// (order-status.ts) rather than inventing a second vocabulary for the
// same statuses.
function StatusBreakdown({ items, emptyLabel }: { items: BreakdownItem[]; emptyLabel: string }) {
  if (items.length === 0) {
    return (
      <Text size="sm" tone="muted">
        {emptyLabel}
      </Text>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center justify-between gap-3 text-sm">
          <BadgeDot tone={item.tone} />
          <span className="flex-1 text-neutral-800">{item.label}</span>
          <span className="tabular-nums text-neutral-900">{item.count}</span>
          {item.amount ? (
            <span className="tabular-nums text-neutral-600">{item.amount}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// A small solid dot instead of a full Badge pill here — three breakdowns in
// a dense list read better with a quiet marker than three repeated pill
// shapes; still real semantic state (the row's own status), not decoration.
function BadgeDot({ tone }: { tone: BadgeTone }) {
  const color =
    tone === "success" ? "bg-success" : tone === "danger" ? "bg-danger" : "bg-neutral-400";
  return <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

interface DashboardPageProps {
  searchParams: Promise<{ from?: string; to?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  await requireSession();
  const { from, to: toParam } = await searchParams;

  const t = await getTranslations("Dashboard");
  const tNav = await getTranslations("Navigation");
  const to = await getTranslations("Orders.status");
  const tp = await getTranslations("Orders.paymentStatus");
  const tr = await getTranslations("Dashboard.refundStatus");
  const locale = await getLocale();
  const client = await getServerApiClient();

  const { data, error, response } = await client.GET("/api/v1/admin/dashboard", {
    params: { query: from && toParam ? { from, to: toParam } : undefined },
  });

  if (error) {
    return (
      <div>
        <Heading level={1}>{tNav("dashboard")}</Heading>
        <ErrorState
          className="mt-6"
          title={response.status === 403 ? t("forbiddenTitle") : t("errorTitle")}
          description={response.status === 403 ? t("forbiddenDescription") : t("errorDescription")}
        />
      </div>
    );
  }

  const alertLines = [
    data.alerts.lowStockCount > 0
      ? t("alerts.lowStock", { count: data.alerts.lowStockCount })
      : null,
    data.alerts.disputedPaymentsCount > 0
      ? t("alerts.disputedPayments", { count: data.alerts.disputedPaymentsCount })
      : null,
    data.alerts.failedRefundsCount > 0
      ? t("alerts.failedRefunds", { count: data.alerts.failedRefundsCount })
      : null,
  ].filter((line): line is string => line !== null);

  const ordersByStatus: BreakdownItem[] = [...data.orders.byStatus]
    .sort((a, b) => b.count - a.count)
    .map((row) => ({ label: to(row.status), count: row.count, tone: orderStatusTone(row.status) }));

  const paymentsByStatus: BreakdownItem[] = [...data.payments.byStatus]
    .sort((a, b) => b.count - a.count)
    .map((row) => ({ label: tp(row.status), count: row.count, tone: paymentStatusTone(row.status) }));

  const refundsByStatus: BreakdownItem[] = [...data.refunds.byStatus]
    .sort((a, b) => b.count - a.count)
    .map((row) => ({
      label: tr(row.status),
      count: row.count,
      tone: refundStatusTone(row.status),
      amount: formatMoney(row.amountMinor, locale as AdminLocale),
    }));

  return (
    <div>
      <Heading level={1}>{tNav("dashboard")}</Heading>
      <Text size="sm" tone="muted" className="mt-1">
        {t("periodRange", {
          from: formatDate(data.period.from, locale),
          to: formatDate(data.period.to, locale),
        })}
      </Text>
      <DashboardDateRangeForm from={data.period.from} to={data.period.to} />

      {alertLines.length > 0 ? (
        <Alert tone="danger" className="mt-6">
          {alertLines.join(" · ")}
        </Alert>
      ) : (
        <Text size="sm" tone="muted" className="mt-6">
          {t("alerts.allClear")}
        </Text>
      )}

      <div className="mt-10">
        <Heading level={2} className="mb-4">
          {t("revenue.title")}
        </Heading>
        <Stat
          size="lg"
          label={t("revenue.net")}
          value={formatMoney(data.revenue.netMinor, locale as AdminLocale)}
        />
        <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat label={t("revenue.gross")} value={formatMoney(data.revenue.grossMinor, locale as AdminLocale)} />
          <Stat
            label={t("revenue.refunds")}
            value={formatMoney(data.revenue.refundsMinor, locale as AdminLocale)}
          />
          <Stat
            label={t("revenue.averageOrderValue")}
            value={
              data.revenue.averageOrderValueMinor === null
                ? t("none")
                : formatMoney(data.revenue.averageOrderValueMinor, locale as AdminLocale)
            }
          />
          <Stat label={t("revenue.confirmedOrders")} value={String(data.revenue.confirmedOrderCount)} />
        </div>
      </div>

      <div className="mt-10">
        <Heading level={2} className="mb-4">
          {t("activity.title")}
        </Heading>
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <Heading level={3} className="mb-2">
              {tNav("orders")}
            </Heading>
            <Text size="sm" tone="muted" className="mb-3">
              {t("totalInPeriod", { count: data.orders.totalInPeriod })}
            </Text>
            <StatusBreakdown items={ordersByStatus} emptyLabel={t("none")} />
          </div>
          <div>
            <Heading level={3} className="mb-2">
              {t("activity.payments")}
            </Heading>
            <Text size="sm" tone="muted" className="mb-3">
              {t("totalInPeriod", { count: data.payments.totalInPeriod })}
            </Text>
            <StatusBreakdown items={paymentsByStatus} emptyLabel={t("none")} />
          </div>
          <div>
            <Heading level={3} className="mb-2">
              {t("activity.refunds")}
            </Heading>
            <Text size="sm" tone="muted" className="mb-3">
              {t("totalInPeriod", { count: data.refunds.totalInPeriod })}
            </Text>
            <StatusBreakdown items={refundsByStatus} emptyLabel={t("none")} />
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        <div>
          <Heading level={2} className="mb-4">
            {t("customers.title")}
          </Heading>
          <div className="grid grid-cols-2 gap-6">
            <Stat label={t("customers.totalRegistered")} value={String(data.customers.totalRegistered)} />
            <Stat label={t("customers.newInPeriod")} value={String(data.customers.newInPeriod)} />
          </div>
        </div>
        <div>
          <Heading level={2} className="mb-4">
            {t("inventory.title")}
          </Heading>
          <Stat label={t("inventory.lowStock")} value={String(data.inventory.lowStockCount)} />
        </div>
      </div>
    </div>
  );
}
