import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container, Heading, Text } from "@ame-de-fil/ui";
import { api } from "../../../lib/api-client";
import { ProductCard } from "../../../components/product-card";
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
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  const { page: pageParam } = await searchParams;
  const t = await getTranslations("Shop");
  const page = Number(pageParam ?? "1") || 1;

  const { data, error } = await api.GET("/api/v1/products", {
    params: { query: { locale, page, pageSize: 24 } },
  });

  if (error || !data) {
    throw new Error("Failed to load products");
  }

  return (
    <Container className="py-16">
      <Heading level={1}>{t("title")}</Heading>
      {data.items.length === 0 ? (
        <Text tone="muted" className="mt-4">
          {t("empty")}
        </Text>
      ) : (
        <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
          {data.items.map((product) => (
            <ProductCard key={product.id} product={product} locale={locale} />
          ))}
        </div>
      )}
    </Container>
  );
}
