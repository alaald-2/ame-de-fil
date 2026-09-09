import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Container, Heading, Text } from "@ame-de-fil/ui";
import { api } from "../../../../lib/api-client";
import { ProductCard } from "../../../../components/product-card";
import type { AppLocale } from "../../../../lib/locale";

type PageParams = { locale: AppLocale; slug: string };

async function loadCollection(slug: string, locale: AppLocale) {
  const { data, error, response } = await api.GET("/api/v1/collections/{slug}", {
    params: { path: { slug }, query: { locale, page: 1, pageSize: 24 } },
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
  const collection = await loadCollection(slug, locale);
  if (!collection) return {};
  return {
    title: collection.metaTitle ?? collection.name,
    description: collection.metaDescription ?? collection.description ?? undefined,
  };
}

export default async function CollectionPage({ params }: { params: Promise<PageParams> }) {
  const { locale, slug } = await params;
  const collection = await loadCollection(slug, locale);
  const t = await getTranslations("Collection");

  if (!collection) notFound();

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
        <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
          {collection.products.map((product) => (
            <ProductCard key={product.id} product={product} locale={locale} />
          ))}
        </div>
      )}
    </Container>
  );
}
