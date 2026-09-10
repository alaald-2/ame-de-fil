import { getTranslations, getLocale } from "next-intl/server";
import { Heading, Text, Pagination, EmptyState, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../lib/dal";
import { getServerApiClient } from "../../../lib/server-api";
import { OrdersTable } from "../../../components/orders-table";

const PAGE_SIZE = 20;

interface OrdersPageProps {
  searchParams: Promise<{ page?: string }>;
}

// Real GET /admin/orders data (orders.view-gated server-side) — mirrors
// customers/page.tsx's structure exactly (same real-data/pagination/
// permission/state conventions), see that file for the fuller rationale.
export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  await requireSession();
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);

  const t = await getTranslations("Orders");
  const tNav = await getTranslations("Navigation");
  const locale = (await getLocale()) as "sv-SE" | "en";
  const client = await getServerApiClient();

  const { data, error, response } = await client.GET("/api/v1/admin/orders", {
    params: { query: { page, pageSize: PAGE_SIZE } },
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
          <ErrorState className="mt-6" title={t("errorTitle")} description={t("errorDescription")} />
        )}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <Heading level={1}>{tNav("orders")}</Heading>
        <Text className="text-neutral-600">{t("resultsCount", { count: data.total })}</Text>
      </div>

      {data.items.length === 0 ? (
        <EmptyState className="mt-6" title={t("emptyTitle")} description={t("emptyDescription")} />
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
              makeHref={(targetPage) => `/orders?page=${targetPage}`}
              previousLabel={t("paginationPrevious")}
              nextLabel={t("paginationNext")}
              pageLabel={(current, total) => t("paginationPage", { page: current, totalPages: total })}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
