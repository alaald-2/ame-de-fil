import { getTranslations, getLocale } from "next-intl/server";
import { Heading, Text, Pagination, SearchField, EmptyState, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../lib/dal";
import { getServerApiClient } from "../../../lib/server-api";
import { ContentTabs } from "../../../components/content-tabs";
import { AdminTaxonomyTable } from "../../../components/admin-taxonomy-table";
import { CreateTaxonomyDialog } from "../../../components/create-taxonomy-dialog";
import type { AdminLocale } from "../../../i18n/config";

const PAGE_SIZE = 20;

interface CategoriesPageProps {
  searchParams: Promise<{ page?: string; q?: string }>;
}

// Real GET /admin/categories data (categories.view-gated server-side) — the
// default "Categories" tab of the two-tab Content section; Collections is
// the sibling /content/collections route, sharing ContentTabs and every
// list/create/detail component (Category and Collection are structurally
// identical — see admin-taxonomy-table.tsx's own comment).
export default async function CategoriesPage({ searchParams }: CategoriesPageProps) {
  const session = await requireSession();
  const { page: pageParam, q: qParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);
  const q = qParam?.trim() ?? "";

  const t = await getTranslations("Content.categories");
  const tNav = await getTranslations("Navigation");
  const locale = (await getLocale()) as AdminLocale;
  const client = await getServerApiClient();
  const permissions = session.user.permissions;

  const { data, error, response } = await client.GET("/api/v1/admin/categories", {
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
          <ErrorState className="mt-6" title={t("forbiddenTitle")} description={t("forbiddenDescription")} />
        ) : (
          <ErrorState className="mt-6" title={t("errorTitle")} description={t("errorDescription")} />
        )}
      </div>
    );
  }

  const canManage = permissions.includes("categories.manage");
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <Heading level={1}>{tNav("content")}</Heading>
        <Text tone="muted">{t("resultsCount", { count: data.total })}</Text>
      </div>

      <div className="mt-6">
        <ContentTabs permissions={permissions} />
      </div>

      <div className="mt-4 max-w-sm">
        <SearchField label={t("searchLabel")} placeholder={t("searchPlaceholder")} />
      </div>

      {canManage ? (
        <div className="mt-6 flex justify-end">
          <CreateTaxonomyDialog kind="categories" />
        </div>
      ) : null}

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
              detailBasePath="/content"
              namespace="Content.categories"
            />
          </div>
          {totalPages > 1 ? (
            <Pagination
              className="mt-8"
              page={data.page}
              totalPages={totalPages}
              makeHref={(targetPage) =>
                q ? `/content?page=${targetPage}&q=${encodeURIComponent(q)}` : `/content?page=${targetPage}`
              }
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
