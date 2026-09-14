import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Container, Heading, Text, Pagination } from "@ame-de-fil/ui";
import { api } from "../../../../lib/api-client";
import { ProductCard } from "../../../../components/product-card";
import { getPathname } from "../../../../i18n/navigation";
import type { AppLocale } from "../../../../lib/locale";

type PageParams = { locale: AppLocale; slug: string };

function buildCollectionHref(locale: AppLocale, slug: string, page: number): string {
  return getPathname({
    href: { pathname: "/collections/[slug]", params: { slug }, query: page > 1 ? { page } : {} },
    locale,
  });
}

async function loadCollection(slug: string, locale: AppLocale, page: number) {
  const { data, error, response } = await api.GET("/api/v1/collections/{slug}", {
    params: { path: { slug }, query: { locale, page, pageSize: 24 } },
  });
  if (response.status === 404) return null;
  if (error || !data) throw new Error("Failed to load collection");
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const collection = await loadCollection(slug, locale, 1);
  if (!collection) return {};
  return {
    title: collection.metaTitle ?? collection.name,
    description: collection.metaDescription ?? collection.description ?? undefined,
  };
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale, slug } = await params;
  const { page: pageParam } = await searchParams;
  const page = Number(pageParam ?? "1") || 1;
  const collection = await loadCollection(slug, locale, page);
  const t = await getTranslations("Collection");
  const tPagination = await getTranslations("Pagination");

  if (!collection) notFound();

  const totalPages = Math.max(1, Math.ceil(collection.productsTotal / collection.productsPageSize));

  return (
    <Container className="py-16">
      <Heading level={1}>{collection.name}</Heading>
      {collection.description ? (
        <Text tone="muted" className="mt-3 max-w-2xl">
          {collection.description}
        </Text>
      ) : null}
      {collection.products.length === 0 ? (
        <Text tone="muted" className="mt-8">
          {t("empty")}
        </Text>
      ) : (
        <>
          <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
            {collection.products.map((product) => (
              <ProductCard key={product.id} product={product} locale={locale} />
            ))}
          </div>
          {totalPages > 1 ? (
            <Pagination
              className="mt-12"
              page={collection.productsPage}
              totalPages={totalPages}
              makeHref={(targetPage) => buildCollectionHref(locale, slug, targetPage)}
              previousLabel={tPagination("previousPage")}
              nextLabel={tPagination("nextPage")}
              pageLabel={(current, total) => tPagination("pageLabel", { page: current, totalPages: total })}
            />
          ) : null}
        </>
      )}
    </Container>
  );
}
