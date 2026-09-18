import { getTranslations, getLocale } from "next-intl/server";
import { Heading, Text, Pagination, SearchField, EmptyState, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../../lib/dal";
import { getServerApiClient } from "../../../../lib/server-api";
import { ContentTabs } from "../../../../components/content-tabs";
import { AdminTaxonomyTable } from "../../../../components/admin-taxonomy-table";
import { CreateTaxonomyDialog } from "../../../../components/create-taxonomy-dialog";
import type { AdminLocale } from "../../../../i18n/config";

const PAGE_SIZE = 20;

interface CollectionsPageProps {
  searchParams: Promise<{ page?: string; q?: string }>;
}

// Mirrors ../page.tsx (Categories) exactly, driving GET /admin/collections
// instead — see admin-taxonomy-table.tsx's own comment for why Category/
// Collection share components rather than duplicating this page's logic.
export default async function CollectionsPage({ searchParams }: CollectionsPageProps) {
  const session = await requireSession();
  const { page: pageParam, q: qParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);
  const q = qParam?.trim() ?? "";

  const t = await getTranslations("Content.collections");
  const tNav = await getTranslations("Navigation");
  const locale = (await getLocale()) as AdminLocale;
  const client = await getServerApiClient();
  const permissions = session.user.permissions;

  const { data, error, response } = await client.GET("/api/v1/admin/collections", {
    params: { query: { page, pageSize: PAGE_SIZE, q: q || undefined } },
  });

  if (error) {
    return (
      <div>
        <Heading level={1}>{tNav("content")}</Heading>
        <div className="mt-6">
          <ContentTabs permissions={permissions} />
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

  const canManage = permissions.includes("collections.manage");
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <Heading level={1}>{tNav("content")}</Heading>
          <Text tone="muted">{t("resultsCount", { count: data.total })}</Text>
        </div>
        {canManage ? <CreateTaxonomyDialog kind="collections" /> : null}
      </div>

      <div className="mt-6">
        <ContentTabs permissions={permissions} />
      </div>

      <div className="mt-4 max-w-sm">
        <SearchField label={t("searchLabel")} placeholder={t("searchPlaceholder")} />
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={q ? t("emptyFilteredTitle") : t("emptyTitle")}
          description={q ? t("emptyFilteredDescription") : t("emptyDescription")}
        />
      ) : (
        <>
          <div className="mt-6">
            <AdminTaxonomyTable
              items={data.items}
              locale={locale}
              detailBasePath="/content/collections"
              namespace="Content.collections"
            />
          </div>
          {totalPages > 1 ? (
            <Pagination
              className="mt-8"
              page={data.page}
              totalPages={totalPages}
              makeHref={(targetPage) =>
                q
                  ? `/content/collections?page=${targetPage}&q=${encodeURIComponent(q)}`
                  : `/content/collections?page=${targetPage}`
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
