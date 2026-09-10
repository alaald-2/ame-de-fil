import { getTranslations, getLocale } from "next-intl/server";
import { Heading, Text, Pagination, EmptyState, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../lib/dal";
import { getServerApiClient } from "../../../lib/server-api";
import { CustomersTable } from "../../../components/customers-table";

const PAGE_SIZE = 20;

interface CustomersPageProps {
  searchParams: Promise<{ page?: string }>;
}

// Real GET /admin/customers data (customers.view-gated server-side) — the
// sidebar already hides this link for a user without the permission
// (sidebar-nav.tsx), but a direct URL visit still needs its own real
// handling, not a redirect that would hide *why* the page refused to load.
export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  await requireSession();
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);

  const t = await getTranslations("Customers");
  const tNav = await getTranslations("Navigation");
  const locale = await getLocale();
  const client = await getServerApiClient();

  const { data, error, response } = await client.GET("/api/v1/admin/customers", {
    params: { query: { page, pageSize: PAGE_SIZE } },
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
          <ErrorState className="mt-6" title={t("errorTitle")} description={t("errorDescription")} />
        )}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <Heading level={1}>{tNav("customers")}</Heading>
        {/* text-neutral-600, not tone="muted" — see customers-table.tsx's
            comment on the same pre-existing contrast issue. */}
        <Text className="text-neutral-600">{t("registeredCount", { count: data.total })}</Text>
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={t("emptyTitle")}
          description={t("emptyDescription")}
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
              makeHref={(targetPage) => `/customers?page=${targetPage}`}
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
