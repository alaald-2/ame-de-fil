import { getTranslations, getLocale } from "next-intl/server";
import { Heading, Text, Pagination, SearchField, EmptyState, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../../lib/dal";
import { getServerApiClient } from "../../../../lib/server-api";
import { InventoryTabs } from "../../../../components/inventory-tabs";
import { MovementsTable } from "../../../../components/inventory-movements-table";

const PAGE_SIZE = 20;

interface MovementsPageProps {
  searchParams: Promise<{ page?: string; q?: string }>;
}

// Real GET /admin/inventory/movements data, most-recent-first — the
// cross-item ledger (inventory.service.ts's listMovements), distinct from
// any single item's own capped preview. Type/variant/date filtering is
// deliberately not built here (ROADMAP.md) — just pagination, matching
// every other Phase 5 list checkpoint.
export default async function MovementsPage({ searchParams }: MovementsPageProps) {
  await requireSession();
  const { page: pageParam, q: qParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);
  const q = qParam?.trim() ?? "";

  const t = await getTranslations("Inventory");
  const tNav = await getTranslations("Navigation");
  const locale = await getLocale();
  const client = await getServerApiClient();

  const { data, error, response } = await client.GET("/api/v1/admin/inventory/movements", {
    params: { query: { page, pageSize: PAGE_SIZE, q: q || undefined } },
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
        <Text tone="muted">{t("movementsCount", { count: data.total })}</Text>
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
          title={q ? t("emptyFilteredTitle") : t("movementsEmptyTitle")}
          description={q ? t("emptyFilteredDescription") : t("movementsEmptyDescription")}
        />
      ) : (
        <>
          <div className="mt-8">
            <MovementsTable movements={data.items} locale={locale} />
          </div>
          {totalPages > 1 ? (
            <Pagination
              className="mt-8"
              page={data.page}
              totalPages={totalPages}
              makeHref={(targetPage) =>
                q
                  ? `/inventory/movements?page=${targetPage}&q=${encodeURIComponent(q)}`
                  : `/inventory/movements?page=${targetPage}`
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
