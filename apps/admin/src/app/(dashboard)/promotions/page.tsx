import { getTranslations, getLocale } from "next-intl/server";
import {
  Heading,
  Text,
  Button,
  Link,
  Pagination,
  SearchField,
  EmptyState,
  ErrorState,
} from "@ame-de-fil/ui";
import { requireSession } from "../../../lib/dal";
import { getServerApiClient } from "../../../lib/server-api";
import { PromotionsTable } from "../../../components/promotions-table";
import type { AdminLocale } from "../../../i18n/config";

const PAGE_SIZE = 20;

interface PromotionsPageProps {
  searchParams: Promise<{ page?: string; q?: string }>;
}

// Real GET /admin/promotions data (promotions.view-gated server-side).
// Mirrors Products' own list conventions (see products/page.tsx) — a
// dedicated area, deliberately never folded into the existing Coupon/
// Discount admin surface (there isn't one yet, but even once built it
// would stay separate — see effective-price.ts's own top comment for why).
export default async function PromotionsPage({ searchParams }: PromotionsPageProps) {
  const session = await requireSession();
  const { page: pageParam, q: qParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);
  const q = qParam?.trim() ?? "";

  const t = await getTranslations("Promotions");
  const tNav = await getTranslations("Navigation");
  const locale = (await getLocale()) as AdminLocale;
  const client = await getServerApiClient();

  const { data, error, response } = await client.GET("/api/v1/admin/promotions", {
    params: { query: { page, pageSize: PAGE_SIZE, q: q || undefined } },
  });

  if (error) {
    return (
      <div>
        <Heading level={1}>{tNav("promotions")}</Heading>
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

  const canCreate = session.user.permissions.includes("promotions.manage");
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <Heading level={1}>{tNav("promotions")}</Heading>
          <Text tone="muted">{t("resultsCount", { count: data.total })}</Text>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/promotions/new">{t("createPromotion")}</Link>
          </Button>
        ) : null}
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
            <PromotionsTable promotions={data.items} locale={locale} />
          </div>
          {totalPages > 1 ? (
            <Pagination
              className="mt-8"
              page={data.page}
              totalPages={totalPages}
              makeHref={(targetPage) =>
                q
                  ? `/promotions?page=${targetPage}&q=${encodeURIComponent(q)}`
                  : `/promotions?page=${targetPage}`
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
