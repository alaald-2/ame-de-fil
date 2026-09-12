import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Container, Heading, Text, Alert } from "@ame-de-fil/ui";
import { api } from "../../../../lib/api-client";
import type { AppLocale } from "../../../../lib/locale";
import { AddToCartButton } from "../../../../components/add-to-cart-button";
import { CartErrorAlert } from "../../../../components/cart-error-alert";
import { SalePrice } from "../../../../components/sale-price";

type PageParams = { locale: AppLocale; slug: string };

async function loadProduct(slug: string, locale: AppLocale) {
  const { data, error, response } = await api.GET("/api/v1/products/{slug}", {
    params: { path: { slug }, query: { locale } },
  });
  if (response.status === 404) return null;
  if (error || !data) throw new Error("Failed to load product");
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const product = await loadProduct(slug, locale);
  if (!product) return {};
  return {
    title: product.metaTitle ?? product.name,
    description: product.metaDescription ?? product.description ?? undefined,
  };
}

export default async function ProductPage({ params }: { params: Promise<PageParams> }) {
  const { locale, slug } = await params;
  const product = await loadProduct(slug, locale);
  const t = await getTranslations("Product");
  const tShop = await getTranslations("Shop");

  if (!product) notFound();

  const primaryImage = product.images[0];

  return (
    <Container className="grid gap-10 py-16 md:grid-cols-2">
      <div className="aspect-[3/4] bg-neutral-100">
        {primaryImage ? (
          // Plain <img>, not next/image — see product-card.tsx (remotePatterns
          // is still empty; image storage vendor deferred, ADR-020).
          <img
            src={primaryImage.url}
            alt={primaryImage.altText ?? ""}
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>
      <div>
        <Heading level={1}>{product.name}</Heading>
        {product.description ? (
          <Text tone="muted" className="mt-3">
            {product.description}
          </Text>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          {product.variants.map((variant) => (
            <div
              key={variant.id}
              className="flex items-center justify-between border-b border-neutral-200 pb-3"
            >
              <div>
                <Text size="sm">
                  {variant.options.map((o) => o.label).join(" / ") || variant.sku || `#${variant.articleNumber}`}
                </Text>
                {!variant.available ? (
                  <Text size="sm" tone="muted">
                    {tShop("soldOut")}
                  </Text>
                ) : variant.productionTimeDays ? (
                  <Text size="sm" tone="muted">
                    {tShop("productionTime", { days: variant.productionTimeDays })}
                  </Text>
                ) : null}
              </div>
              <div className="flex items-center gap-4">
                <SalePrice
                  price={variant.price}
                  originalPrice={variant.originalPrice}
                  promotion={variant.promotion}
                  locale={locale}
                  size="base"
                />
                <AddToCartButton variantId={variant.id} available={variant.available} />
              </div>
            </div>
          ))}
        </div>

        <CartErrorAlert />

        {product.materials ? (
          <div className="mt-8">
            <Heading level={4}>{t("materials")}</Heading>
            <Text tone="muted" className="mt-1">
              {product.materials}
            </Text>
          </div>
        ) : null}

        {product.careInstructions ? (
          <div className="mt-6">
            <Heading level={4}>{t("careInstructions")}</Heading>
            <Text tone="muted" className="mt-1">
              {product.careInstructions}
            </Text>
          </div>
        ) : null}

        {product.story ? (
          <Alert tone="info" className="mt-8">
            {product.story}
          </Alert>
        ) : null}
      </div>
    </Container>
  );
}
