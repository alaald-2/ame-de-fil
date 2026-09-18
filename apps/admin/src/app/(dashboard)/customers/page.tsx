import { getTranslations, getLocale } from "next-intl/server";
import { Heading, Text, Pagination, SearchField, EmptyState, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../lib/dal";
import { getServerApiClient } from "../../../lib/server-api";
import { CustomersTable } from "../../../components/customers-table";

const PAGE_SIZE = 20;

interface CustomersPageProps {
  searchParams: Promise<{ page?: string; q?: string }>;
}

function buildCustomersHref(q: string, page?: number): string {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (page && page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/customers?${qs}` : "/customers";
}

// Real GET /admin/customers data (customers.view-gated server-side) — the
// sidebar already hides this link for a user without the permission
// (sidebar-nav.tsx), but a direct URL visit still needs its own real
// handling, not a redirect that would hide *why* the page refused to load.
export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  await requireSession();
  const { page: pageParam, q: qParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);
  const q = qParam?.trim() ?? "";

  const t = await getTranslations("Customers");
  const tNav = await getTranslations("Navigation");
  const locale = await getLocale();
  const client = await getServerApiClient();

  const { data, error, response } = await client.GET("/api/v1/admin/customers", {
    params: { query: { page, pageSize: PAGE_SIZE, q: q || undefined } },
  });

  if (error) {
    return (
      <div>
        <Heading level={1}>{tNav("customers")}</Heading>
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
        <Heading level={1}>{tNav("customers")}</Heading>
        <Text tone="muted">{t("registeredCount", { count: data.total })}</Text>
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
          <div className="mt-8">
            <CustomersTable customers={data.items} locale={locale} />
          </div>
          {totalPages > 1 ? (
            <Pagination
              className="mt-8"
              page={data.page}
              totalPages={totalPages}
              makeHref={(targetPage) => buildCustomersHref(q, targetPage)}
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
