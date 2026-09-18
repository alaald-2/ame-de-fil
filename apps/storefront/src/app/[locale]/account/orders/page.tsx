import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container, Heading, Pagination, EmptyState } from "@ame-de-fil/ui";
import { requireSession } from "../../../../lib/dal";
import { getServerApiClient } from "../../../../lib/server-api";
import { getPathname } from "../../../../i18n/navigation";
import { OrderSummaryRow } from "../../../../components/order-summary-row";
import type { AppLocale } from "../../../../lib/locale";

const PAGE_SIZE = 20;

type LocaleParams = { locale: AppLocale };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Account.Orders");
  return { title: t("title") };
}

// Authenticated-only (requireSession, same DAL call account/page.tsx
// already uses) — mirrors shop/page.tsx's server-component pagination
// pattern, but via getServerApiClient (cookie-forwarding), not the plain
// browser-facing client, since GET /orders requires the caller's session.
export default async function AccountOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<LocaleParams>;
  searchParams: Promise<{ page?: string }>;
}) {
  await requireSession();
  const { locale } = await params;
  const { page: pageParam } = await searchParams;
  const t = await getTranslations("Account.Orders");
  const tPagination = await getTranslations("Pagination");
  const page = Number(pageParam ?? "1") || 1;

  const client = await getServerApiClient();
  const { data, error } = await client.GET("/api/v1/orders", {
    params: { query: { page, pageSize: PAGE_SIZE } },
  });

  if (error || !data) {
    throw new Error("Failed to load orders");
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <Container className="py-16">
      <Heading level={1}>{t("title")}</Heading>

      {data.items.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <>
          <div className="mt-8 flex flex-col">
            {data.items.map((order) => (
              <OrderSummaryRow key={order.orderId} order={order} locale={locale} />
            ))}
          </div>
          {totalPages > 1 ? (
            <Pagination
              className="mt-8"
              page={data.page}
              totalPages={totalPages}
              makeHref={(targetPage) =>
                getPathname({
                  href: {
                    pathname: "/account/orders",
                    query: targetPage > 1 ? { page: targetPage } : {},
                  },
                  locale,
                })
              }
              previousLabel={tPagination("previousPage")}
              nextLabel={tPagination("nextPage")}
              pageLabel={(current, total) =>
                tPagination("pageLabel", { page: current, totalPages: total })
              }
            />
          ) : null}
        </>
      )}
    </Container>
  );
}
