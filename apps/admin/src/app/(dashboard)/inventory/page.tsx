import { getTranslations } from "next-intl/server";
import { Heading, Text, Pagination, SearchField, EmptyState, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../lib/dal";
import { getServerApiClient } from "../../../lib/server-api";
import { InventoryTabs } from "../../../components/inventory-tabs";
import { InventoryTable } from "../../../components/inventory-table";

const PAGE_SIZE = 20;

interface InventoryPageProps {
  searchParams: Promise<{ page?: string; q?: string }>;
}

// Real GET /admin/inventory data (inventory.view-gated server-side) — same
// real-data/pagination/permission/state conventions as orders/customers
// (see orders/page.tsx). This is the "overview" tab of the four-tab
// inventory section; low-stock/reservations/movements are sibling routes
// sharing InventoryTabs.
export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const session = await requireSession();
  const canAdjust = session.user.permissions.includes("inventory.adjust");
  const { page: pageParam, q: qParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);
  const q = qParam?.trim() ?? "";

  const t = await getTranslations("Inventory");
  const tNav = await getTranslations("Navigation");
  const client = await getServerApiClient();

  const { data, error, response } = await client.GET("/api/v1/admin/inventory", {
    params: { query: { page, pageSize: PAGE_SIZE, q: q || undefined } },
  });

  if (error) {
    return (
      <div>
        <Heading level={1}>{tNav("inventory")}</Heading>
        <InventoryTabs />
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

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <Heading level={1}>{tNav("inventory")}</Heading>
        <Text tone="muted">{t("resultsCount", { count: data.total })}</Text>
      </div>

      <div className="mt-4 max-w-sm">
        <SearchField label={t("searchLabel")} placeholder={t("searchPlaceholder")} />
      </div>

      <div className="mt-6">
        <InventoryTabs />
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={q ? t("emptyFilteredTitle") : t("emptyTitle")}
          description={q ? t("emptyFilteredDescription") : t("emptyDescription")}
        />
      ) : (
        <>
          <div className="mt-8">
            <InventoryTable items={data.items} canAdjust={canAdjust} />
          </div>
          {totalPages > 1 ? (
            <Pagination
              className="mt-8"
              page={data.page}
              totalPages={totalPages}
              makeHref={(targetPage) =>
                q
                  ? `/inventory?page=${targetPage}&q=${encodeURIComponent(q)}`
                  : `/inventory?page=${targetPage}`
              }
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
