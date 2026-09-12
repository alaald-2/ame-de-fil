import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Container, Heading, Text, Alert } from "@ame-de-fil/ui";
import { api } from "../../../../lib/api-client";
import type { AppLocale } from "../../../../lib/locale";
import { Link } from "../../../../i18n/navigation";
import { CartErrorAlert } from "../../../../components/cart-error-alert";
import { ProductGallery } from "../../../../components/product-gallery";
import { ProductVariantSelector } from "../../../../components/product-variant-selector";
import { ProductCard } from "../../../../components/product-card";

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
  const tNav = await getTranslations("Navigation");
  const tFooter = await getTranslations("Footer");

  if (!product) notFound();

  const primaryCategory = product.categories[0];
  const relatedFilter = primaryCategory
    ? { category: primaryCategory.id }
    : product.collections[0]
      ? { collection: product.collections[0].id }
      : null;

  // Same category/collection as this product, real published items only —
  // never both filters at once (products.service.ts's own `where` clause
  // ANDs category+collection together, which would under-match a product
  // that isn't in both).
  const relatedProducts = relatedFilter
    ? await api
        .GET("/api/v1/products", {
          params: { query: { locale, page: 1, pageSize: 5, ...relatedFilter } },
        })
        .then(({ data }) => (data?.items ?? []).filter((item) => item.id !== product.id).slice(0, 4))
    : [];

  return (
    <Container className="py-16">
      <nav aria-label={t("breadcrumbLabel")} className="mb-8 flex flex-wrap items-center gap-2 text-sm">
        <Link href="/shop" className="text-neutral-600 hover:text-neutral-900">
          {tNav("shop")}
        </Link>
        {primaryCategory ? (
          <>
            <span aria-hidden="true" className="text-neutral-400">
              /
            </span>
            <Link
              href={{ pathname: "/categories/[slug]", params: { slug: primaryCategory.slug } }}
              className="text-neutral-600 hover:text-neutral-900"
            >
              {primaryCategory.name}
            </Link>
          </>
        ) : null}
        <span aria-hidden="true" className="text-neutral-400">
          /
        </span>
        <Text size="sm" className="text-neutral-900">
          {product.name}
        </Text>
      </nav>

      <div className="grid gap-10 md:grid-cols-2">
        <ProductGallery images={product.images} />
        <div>
          <Heading level={1}>{product.name}</Heading>
          {product.description ? (
            <Text tone="muted" className="mt-3">
              {product.description}
            </Text>
          ) : null}

          <ProductVariantSelector variants={product.variants} locale={locale} />

          <CartErrorAlert />

          <div className="mt-8 flex flex-col gap-1 border-t border-neutral-200 pt-6">
            <Text size="sm" tone="muted">
              {t("handmadeNotice")}
            </Text>
            <Link href="/shipping" className="w-fit text-sm text-neutral-600 hover:text-neutral-900">
              {tFooter("shipping")}
            </Link>
          </div>

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
      </div>

      {relatedProducts.length > 0 ? (
        <div className="mt-20">
          <Heading level={2}>{t("relatedTitle")}</Heading>
          <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {relatedProducts.map((related) => (
              <ProductCard key={related.id} product={related} locale={locale} />
            ))}
          </div>
        </div>
      ) : null}
    </Container>
  );
}
