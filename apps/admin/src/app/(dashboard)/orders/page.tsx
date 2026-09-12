import { getTranslations, getLocale } from "next-intl/server";
import { Heading, Text, Link, Pagination, SearchField, EmptyState, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../lib/dal";
import { getServerApiClient } from "../../../lib/server-api";
import { OrdersTable } from "../../../components/orders-table";
import { OrdersExportLink } from "../../../components/orders-export-link";
import type { AdminLocale } from "../../../i18n/config";

const PAGE_SIZE = 20;

type PaymentStatusFilter =
  | "PENDING"
  | "AUTHORIZED"
  | "PAID"
  | "FAILED"
  | "CANCELED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "DISPUTED";
type RefundStatusFilter = "PENDING" | "SUCCEEDED" | "FAILED";

interface OrdersPageProps {
  searchParams: Promise<{ page?: string; paymentStatus?: string; refundStatus?: string; q?: string }>;
}

// Real GET /admin/orders data (orders.view-gated server-side) — mirrors
// customers/page.tsx's structure exactly (same real-data/pagination/
// permission/state conventions), see that file for the fuller rationale.
// paymentStatus/refundStatus are optional drill-down filters that exist
// only so the Dashboard's own alert lines (disputed payments, failed
// refunds) have somewhere real to land — see admin-orders.service.ts's
// listOrders. No filter UI is built here beyond that entry point; this
// page only reads and preserves whichever filter is already in the URL.
export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  await requireSession();
  const {
    page: pageParam,
    paymentStatus: paymentStatusParam,
    refundStatus: refundStatusParam,
    q: qParam,
  } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);
  const paymentStatus = paymentStatusParam as PaymentStatusFilter | undefined;
  const refundStatus = refundStatusParam as RefundStatusFilter | undefined;
  const q = qParam?.trim() ?? "";

  const t = await getTranslations("Orders");
  const tNav = await getTranslations("Navigation");
  const tRefundStatus = await getTranslations("Dashboard.refundStatus");
  const locale = (await getLocale()) as AdminLocale;
  const client = await getServerApiClient();

  const { data, error, response } = await client.GET("/api/v1/admin/orders", {
    params: { query: { page, pageSize: PAGE_SIZE, paymentStatus, refundStatus, q: q || undefined } },
  });

  if (error) {
    return (
      <div>
        <Heading level={1}>{tNav("orders")}</Heading>
        {response.status === 403 ? (
          <ErrorState
            className="mt-6"
            title={t("forbiddenTitle")}
            description={t("forbiddenDescription")}
          />
        ) : (
          <ErrorState
            className="mt-6"
            title={t("errorTitle")}
            description={t("errorDescription")}
          />
        )}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const filterParams = new URLSearchParams();
  if (paymentStatus) filterParams.set("paymentStatus", paymentStatus);
  if (refundStatus) filterParams.set("refundStatus", refundStatus);
  const filterQueryString = filterParams.toString();
  const isFiltered = filterQueryString.length > 0;

  // Same "preserve filters, drop page" shape as products/page.tsx's own
  // buildProductsHref — `q` itself never survives into a page-preserving
  // link unless explicitly passed back in.
  function buildOrdersHref(nextQ: string, page?: number): string {
    const params = new URLSearchParams(filterParams);
    if (nextQ.trim()) params.set("q", nextQ.trim());
    if (page && page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/orders?${qs}` : "/orders";
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <Heading level={1}>{tNav("orders")}</Heading>
        <Text tone="muted">{t("resultsCount", { count: data.total })}</Text>
      </div>

      {isFiltered ? (
        <Text size="sm" tone="muted" className="mt-1">
          {paymentStatus
            ? t("filteredByPaymentStatus", { status: t(`paymentStatus.${paymentStatus}`) })
            : t("filteredByRefundStatus", {
                status: refundStatus ? tRefundStatus(refundStatus) : "",
              })}
          {" · "}
          <Link href="/orders">{t("clearFilter")}</Link>
        </Text>
      ) : null}

      <div className="mt-4 max-w-sm">
        <SearchField label={t("searchLabel")} placeholder={t("searchPlaceholder")} />
      </div>

      <div className="mt-4">
        <OrdersExportLink />
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={isFiltered || q ? t("emptyFilteredTitle") : t("emptyTitle")}
          description={isFiltered || q ? t("emptyFilteredDescription") : t("emptyDescription")}
        />
      ) : (
        <>
          <div className="mt-8">
            <OrdersTable orders={data.items} locale={locale} />
          </div>
          {totalPages > 1 ? (
            <Pagination
              className="mt-8"
              page={data.page}
              totalPages={totalPages}
              makeHref={(targetPage) => buildOrdersHref(q, targetPage)}
              previousLabel={t("paginationPrevious")}
              nextLabel={t("paginationNext")}
              pageLabel={(current, total) =>
                t("paginationPage", { page: current, totalPages: total })
              }
            />
          ) : null}
        </>
      )}
    </div>
  );
}
