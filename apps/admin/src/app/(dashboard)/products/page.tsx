import { getTranslations, getLocale } from "next-intl/server";
import { Heading, Text, Button, Link, Pagination, SearchField, EmptyState, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../lib/dal";
import { getServerApiClient } from "../../../lib/server-api";
import { AdminProductsTable } from "../../../components/admin-products-table";
import { ProductStatusTabs } from "../../../components/product-status-tabs";
import type { AdminLocale } from "../../../i18n/config";

const PAGE_SIZE = 20;

type ProductStatusFilter = "DRAFT" | "PUBLISHED" | "ARCHIVED";

interface ProductsPageProps {
  searchParams: Promise<{ page?: string; status?: string; q?: string }>;
}

// Shared by the search box and Pagination below — the query string a link
// on this page needs, given what it must preserve (status) vs. what it
// intentionally drops (page, whenever `q` itself changes — that's what
// makes "search resets pagination to 1" true without either caller having
// to remember it separately).
function buildProductsHref(status: string | undefined, q: string, page?: number): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q.trim()) params.set("q", q.trim());
  if (page && page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/products?${qs}` : "/products";
}

// Real GET /admin/products data (products.view-gated server-side). Mirrors
// Orders/Inventory's own list conventions (see orders/page.tsx). Unlike
// Orders' own filters (drill-down-only, no in-page UI — see that file's
// comment), status has a real tab strip here: ARCHIVED products can never
// be deleted once they've sold (admin-products.service.ts's deleteProduct),
// so without a filter they'd stay mixed into one ever-growing updatedAt
// list forever.
export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const session = await requireSession();
  const { page: pageParam, status: statusParam, q: qParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);
  const status =
    statusParam === "DRAFT" || statusParam === "PUBLISHED" || statusParam === "ARCHIVED"
      ? (statusParam as ProductStatusFilter)
      : undefined;
  const q = qParam?.trim() ?? "";

  const t = await getTranslations("Products");
  const tNav = await getTranslations("Navigation");
  const locale = (await getLocale()) as AdminLocale;
  const client = await getServerApiClient();

  const { data, error, response } = await client.GET("/api/v1/admin/products", {
    params: { query: { page, pageSize: PAGE_SIZE, status, q: q || undefined } },
  });

  if (error) {
    return (
      <div>
        <Heading level={1}>{tNav("products")}</Heading>
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

  const canCreate = session.user.permissions.includes("products.create");
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <Heading level={1}>{tNav("products")}</Heading>
        <Text tone="muted">{t("resultsCount", { count: data.total })}</Text>
      </div>

      <div className="mt-4 max-w-sm">
        <SearchField label={t("searchLabel")} placeholder={t("searchPlaceholder")} />
      </div>

      {canCreate ? (
        <div className="mt-6 flex justify-end">
          <Button asChild>
            <Link href="/products/new">{t("createProduct")}</Link>
          </Button>
        </div>
      ) : null}

      <div className="mt-6">
        <ProductStatusTabs current={status} />
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={status || q ? t("emptyFilteredTitle") : t("emptyTitle")}
          description={status || q ? t("emptyFilteredDescription") : t("emptyDescription")}
        />
      ) : (
        <>
          <div className="mt-6">
            <AdminProductsTable products={data.items} locale={locale} />
          </div>
          {totalPages > 1 ? (
            <Pagination
              className="mt-8"
              page={data.page}
              totalPages={totalPages}
              makeHref={(targetPage) => buildProductsHref(status, q, targetPage)}
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
