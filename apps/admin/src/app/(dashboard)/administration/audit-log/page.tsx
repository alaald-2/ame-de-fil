import { getTranslations, getLocale } from "next-intl/server";
import { Heading, Text, Pagination, EmptyState, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../../lib/dal";
import { getServerApiClient } from "../../../../lib/server-api";
import { AdministrationTabs } from "../../../../components/administration-tabs";
import { AuditLogTable } from "../../../../components/audit-log-table";
import type { AdminLocale } from "../../../../i18n/config";

const PAGE_SIZE = 20;

interface AuditLogPageProps {
  searchParams: Promise<{ page?: string }>;
}

// Real GET /admin/audit-log data — audit.view-gated server-side, its own
// distinct permission from users.view (SECURITY.md §9: the audit trail
// reveals other admins' actions and IPs, a more sensitive privilege). No
// per-entity/actor/date filtering (ROADMAP.md's own "deliberately not
// built" for this checkpoint) — just pagination, matching every other
// Phase 5 list.
export default async function AuditLogPage({ searchParams }: AuditLogPageProps) {
  const session = await requireSession();
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);

  const t = await getTranslations("Administration.auditLog");
  const tNav = await getTranslations("Navigation");
  const locale = (await getLocale()) as AdminLocale;
  const client = await getServerApiClient();

  const { data, error, response } = await client.GET("/api/v1/admin/audit-log", {
    params: { query: { page, pageSize: PAGE_SIZE } },
  });

  if (error) {
    return (
      <div>
        <Heading level={1}>{tNav("administration")}</Heading>
        <div className="mt-6">
          <AdministrationTabs permissions={session.user.permissions} />
        </div>
        {response.status === 403 ? (
          <ErrorState className="mt-6" title={t("forbiddenTitle")} description={t("forbiddenDescription")} />
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
        <Heading level={1}>{tNav("administration")}</Heading>
        <Text className="text-neutral-600">{t("resultsCount", { count: data.total })}</Text>
      </div>

      <div className="mt-6">
        <AdministrationTabs permissions={session.user.permissions} />
      </div>

      {data.items.length === 0 ? (
        <EmptyState className="mt-6" title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <>
          <div className="mt-8">
            <AuditLogTable entries={data.items} locale={locale} />
          </div>
          {totalPages > 1 ? (
            <Pagination
              className="mt-8"
              page={data.page}
              totalPages={totalPages}
              makeHref={(targetPage) => `/administration/audit-log?page=${targetPage}`}
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
