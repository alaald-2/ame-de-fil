import { getTranslations } from "next-intl/server";
import { Container, Heading, Text, Button, PlaceholderImage } from "@ame-de-fil/ui";
import { Link } from "../../i18n/navigation";
import { api } from "../../lib/api-client";
import { ProductCard } from "../../components/product-card";
import type { AppLocale } from "../../lib/locale";

// Image-led hero (placeholder imagery until real catalog photography exists
// — DECISIONS.md ADR-020) + a "new arrivals" grid of real published
// products, replacing the earlier text-only shell now that the catalog
// module backing it exists. "New arrivals" (most-recently-published), not
// "Featured" — there's no curation/featured flag in the schema, and this
// section shouldn't imply editorial curation that isn't actually happening.
export default async function HomePage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const t = await getTranslations("Home");

  const { data } = await api.GET("/api/v1/products", {
    params: { query: { locale, page: 1, pageSize: 4 } },
  });
  const newArrivals = data?.items ?? [];

  return (
    <>
      <Container className="grid gap-10 py-16 md:grid-cols-2 md:items-center md:py-24">
        <div className="text-center md:text-left">
          <Heading level={1}>{t("heroTitle")}</Heading>
          <Text size="lg" tone="muted" className="mx-auto mt-4 max-w-md md:mx-0">
            {t("heroSubtitle")}
          </Text>
          <div className="mt-8 flex justify-center md:justify-start">
            <Button asChild>
              <Link href="/shop">{t("cta")}</Link>
            </Button>
          </div>
        </div>
        <PlaceholderImage className="aspect-[4/5] w-full" />
      </Container>

      {newArrivals.length > 0 ? (
        <Container className="pb-20">
          <Heading level={2}>{t("newArrivalsTitle")}</Heading>
          <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {newArrivals.map((product) => (
              <ProductCard key={product.id} product={product} locale={locale} />
            ))}
          </div>
        </Container>
      ) : null}
    </>
  );
}
