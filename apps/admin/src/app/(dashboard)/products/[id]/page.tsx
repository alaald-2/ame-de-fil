import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { Heading, Text, Link, Badge, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../../lib/dal";
import { getServerApiClient } from "../../../../lib/server-api";
import { productStatusTone } from "../../../../lib/product-status";
import { ProductStatusAction } from "../../../../components/product-status-action";
import { DeleteProductAction } from "../../../../components/delete-product-action";
import { ProductDetailsForm } from "../../../../components/product-details-form";
import { ProductVariantsForm } from "../../../../components/product-variants-form";
import { ProductImagesForm } from "../../../../components/product-images-form";
import { formatDateTime } from "../../../../lib/format-date";
import type { AdminLocale } from "../../../../i18n/config";

interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
}

// Real GET /admin/products/:id data (products.view-gated server-side) —
// three independently-saveable sections: details (translations + category/
// collection membership), status transition, and per-variant simple
// fields. Mirrors the Orders detail page's own "server-rendered shell,
// client islands for each real mutation" shape.
export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const session = await requireSession();
  const { id } = await params;

  const t = await getTranslations("Products");
  const td = await getTranslations("Products.detail");
  const locale = (await getLocale()) as AdminLocale;
  const client = await getServerApiClient();
  const permissions = session.user.permissions;

  const {
    data: product,
    error,
    response,
  } = await client.GET("/api/v1/admin/products/{id}", {
    params: { path: { id } },
  });

  if (error) {
    if (response.status === 404) notFound();
    return (
      <ErrorState
        className="mt-6"
        title={response.status === 403 ? t("forbiddenTitle") : td("detailErrorTitle")}
        description={
          response.status === 403 ? t("forbiddenDescription") : td("detailErrorDescription")
        }
      />
    );
  }

  const canUpdate = permissions.includes("products.update");
  const canDelete = permissions.includes("products.delete");
  // Same content-locale mapping as products/new/page.tsx — the catalog's
  // own translation rows only ever exist in sv-SE/en (never "es").
  const contentLocale = locale === "sv-SE" ? "sv-SE" : "en";

  const [categoriesResult, collectionsResult, taxClassesResult] = canUpdate
    ? await Promise.all([
        client.GET("/api/v1/categories", { params: { query: { locale: contentLocale } } }),
        client.GET("/api/v1/collections", { params: { query: { locale: contentLocale } } }),
        client.GET("/api/v1/admin/tax-classes"),
      ])
    : [null, null, null];

  const categories =
    categoriesResult && !categoriesResult.error
      ? categoriesResult.data.map((c) => ({ id: c.id, name: c.name }))
      : [];
  const collections =
    collectionsResult && !collectionsResult.error
      ? collectionsResult.data.map((c) => ({ id: c.id, name: c.name }))
      : [];
  const taxClasses = taxClassesResult && !taxClassesResult.error ? taxClassesResult.data : [];

  const displayName =
    product.translations.find((tr) => tr.locale === contentLocale)?.name ??
    product.translations[0]?.name ??
    product.id;

  return (
    <div>
      <Link href="/products" className="text-sm">
        &larr; {td("backToProducts")}
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Heading level={1}>{displayName}</Heading>
          <Badge tone={productStatusTone(product.status)}>{t(`status.${product.status}`)}</Badge>
        </div>
        <div className="flex items-center gap-3">
          {canUpdate ? (
            <ProductStatusAction productId={product.id} status={product.status} />
          ) : null}
          {canDelete ? <DeleteProductAction productId={product.id} /> : null}
        </div>
      </div>

      <Text tone="muted" className="mt-1">
        {td("updated")}: {formatDateTime(product.updatedAt, locale)}
      </Text>

      <div className="mt-8">
        <Heading level={2} className="mb-4">
          {td("detailsHeading")}
        </Heading>
        {canUpdate ? (
          <ProductDetailsForm
            productId={product.id}
            translations={product.translations}
            categoryIds={product.categoryIds}
            collectionIds={product.collectionIds}
            categories={categories}
            collections={collections}
          />
        ) : (
          <Text size="sm" tone="muted">
            {td("readOnlyNotice")}
          </Text>
        )}
      </div>

      <div className="mt-10">
        <Heading level={2} className="mb-4">
          {td("imagesHeading")}
        </Heading>
        {canUpdate ? (
          <ProductImagesForm productId={product.id} images={product.images} />
        ) : (
          <Text size="sm" tone="muted">
            {td("readOnlyNotice")}
          </Text>
        )}
      </div>

      <div className="mt-10">
        <Heading level={2} className="mb-4">
          {td("variantsHeading")}
        </Heading>
        {canUpdate ? (
          <ProductVariantsForm
            productId={product.id}
            variants={product.variants}
            taxClasses={taxClasses}
            locale={locale}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {product.variants.map((variant) => (
              <li key={variant.id}>
                <Text size="sm">{variant.sku}</Text>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
