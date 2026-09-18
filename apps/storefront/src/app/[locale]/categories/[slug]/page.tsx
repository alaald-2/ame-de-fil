import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Container, Heading, Text, Pagination } from "@ame-de-fil/ui";
import { api } from "../../../../lib/api-client";
import { ProductCard } from "../../../../components/product-card";
import { buildCategoryHref } from "../../../../lib/pagination-href";
import { unwrapOrNotFound } from "../../../../lib/fetch-or-not-found";
import type { AppLocale } from "../../../../lib/locale";

type PageParams = { locale: AppLocale; slug: string };

async function loadCategory(slug: string, locale: AppLocale, page: number) {
  const result = await api.GET("/api/v1/categories/{slug}", {
    params: { path: { slug }, query: { locale, page, pageSize: 24 } },
  });
  return unwrapOrNotFound(result, "Failed to load category");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const category = await loadCategory(slug, locale, 1);
  if (!category) return {};
  return {
    title: category.metaTitle ?? category.name,
    description: category.metaDescription ?? category.description ?? undefined,
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale, slug } = await params;
  const { page: pageParam } = await searchParams;
  const page = Number(pageParam ?? "1") || 1;
  const category = await loadCategory(slug, locale, page);
  const t = await getTranslations("Category");
  const tPagination = await getTranslations("Pagination");

  if (!category) notFound();

  const totalPages = Math.max(1, Math.ceil(category.productsTotal / category.productsPageSize));

  return (
    <Container className="py-16">
      <Heading level={1}>{category.name}</Heading>
      {category.description ? (
        <Text tone="muted" className="mt-3 max-w-2xl">
          {category.description}
        </Text>
      ) : null}
      {category.products.length === 0 ? (
        <Text tone="muted" className="mt-8">
          {t("empty")}
        </Text>
      ) : (
        <>
          <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
            {category.products.map((product) => (
              <ProductCard key={product.id} product={product} locale={locale} />
            ))}
          </div>
          {totalPages > 1 ? (
            <Pagination
              className="mt-12"
              page={category.productsPage}
              totalPages={totalPages}
              makeHref={(targetPage) => buildCategoryHref(locale, slug, targetPage)}
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
