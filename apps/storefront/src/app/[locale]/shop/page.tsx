import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container, Heading, Text, Reveal, Pagination } from "@ame-de-fil/ui";
import { api } from "../../../lib/api-client";
import { ProductCard } from "../../../components/product-card";
import { buildShopHref } from "../../../lib/pagination-href";
import type { AppLocale } from "../../../lib/locale";

type LocaleParams = { locale: AppLocale };

export async function generateMetadata({
  params,
}: {
  params: Promise<LocaleParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Shop" });
  return { title: t("title") };
}

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<LocaleParams>;
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { locale } = await params;
  const { page: pageParam, q } = await searchParams;
  const t = await getTranslations("Shop");
  const tPagination = await getTranslations("Pagination");
  const page = Number(pageParam ?? "1") || 1;
  const query = q?.trim() || undefined;

  const { data, error } = await api.GET("/api/v1/products", {
    params: { query: { locale, page, pageSize: 24, q: query } },
  });

  if (error || !data) {
    throw new Error("Failed to load products");
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <Container className="py-16">
      <Heading level={1}>{query ? t("searchResultsFor", { query }) : t("title")}</Heading>
      {data.items.length === 0 ? (
        <Text tone="muted" className="mt-4">
          {query ? t("emptySearch", { query }) : t("empty")}
        </Text>
      ) : (
        <>
          <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
            {data.items.map((product, index) => (
              <Reveal key={product.id} delay={Math.min(index, 8) * 60}>
                <ProductCard product={product} locale={locale} />
              </Reveal>
            ))}
          </div>
          {totalPages > 1 ? (
            <Pagination
              className="mt-12"
              page={data.page}
              totalPages={totalPages}
              makeHref={(targetPage) => buildShopHref(locale, query, targetPage)}
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
