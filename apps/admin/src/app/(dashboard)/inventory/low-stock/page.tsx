import { getTranslations } from "next-intl/server";
import { Heading, Text, Pagination, EmptyState, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../../lib/dal";
import { getServerApiClient } from "../../../../lib/server-api";
import { InventoryTabs } from "../../../../components/inventory-tabs";
import { InventoryTable } from "../../../../components/inventory-table";

const PAGE_SIZE = 20;

interface LowStockPageProps {
  searchParams: Promise<{ page?: string }>;
}

// Real GET /admin/inventory/low-stock data — same InventoryTable/response
// shape as the overview tab, just the API's own "onHand - reserved <
// lowStockThreshold" filter and "most urgent first" ordering
// (inventory.service.ts's listLowStock), not a client-side filter.
export default async function LowStockPage({ searchParams }: LowStockPageProps) {
  await requireSession();
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);

  const t = await getTranslations("Inventory");
  const tNav = await getTranslations("Navigation");
  const client = await getServerApiClient();

  const { data, error, response } = await client.GET("/api/v1/admin/inventory/low-stock", {
    params: { query: { page, pageSize: PAGE_SIZE } },
  });

  if (error) {
    return (
      <div>
        <Heading level={1}>{tNav("inventory")}</Heading>
        <div className="mt-6">
          <InventoryTabs />
        </div>
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
        <Heading level={1}>{tNav("inventory")}</Heading>
        <Text className="text-neutral-600">{t("lowStockCount", { count: data.total })}</Text>
      </div>

      <div className="mt-6">
        <InventoryTabs />
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={t("lowStockEmptyTitle")}
          description={t("lowStockEmptyDescription")}
        />
      ) : (
        <>
          <div className="mt-8">
            <InventoryTable items={data.items} />
          </div>
          {totalPages > 1 ? (
            <Pagination
              className="mt-8"
              page={data.page}
              totalPages={totalPages}
              makeHref={(targetPage) => `/inventory/low-stock?page=${targetPage}`}
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
