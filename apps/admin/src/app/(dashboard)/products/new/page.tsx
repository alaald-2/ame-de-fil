import { getTranslations, getLocale } from "next-intl/server";
import { Heading, Text, Link, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../../lib/dal";
import { getServerApiClient } from "../../../../lib/server-api";
import { CreateProductForm } from "../../../../components/create-product-form";

// Categories/Collections have their own admin CRUD (content/*.tsx) — this
// reuses their existing *public* read endpoints (GET /categories,
// GET /collections, both @Public()) purely to populate the picker here,
// the same way any other consumer of the catalog would.
export default async function NewProductPage() {
  const session = await requireSession();

  const t = await getTranslations("Products");
  const tCreate = await getTranslations("Products.create");
  const locale = await getLocale();
  const client = await getServerApiClient();

  // The catalog's own content locale (ProductTranslation/CategoryTranslation/
  // CollectionTranslation) only ever has sv-SE/en rows — "es" is purely the
  // Admin UI's own display language and was never added as a content
  // locale (storefront/backend locale strategy is explicitly untouched).
  // Falls back to English so a Spanish-viewing admin still gets real
  // category/collection names instead of a 400 from the public endpoint.
  const contentLocale = locale === "sv-SE" ? "sv-SE" : "en";

  if (!session.user.permissions.includes("products.create")) {
    return (
      <div>
        <Heading level={1}>{tCreate("heading")}</Heading>
        <ErrorState className="mt-6" title={t("forbiddenTitle")} description={t("forbiddenDescription")} />
      </div>
    );
  }

  const [categoriesResult, collectionsResult, taxClassesResult] = await Promise.all([
    client.GET("/api/v1/categories", { params: { query: { locale: contentLocale } } }),
    client.GET("/api/v1/collections", { params: { query: { locale: contentLocale } } }),
    client.GET("/api/v1/admin/tax-classes"),
  ]);

  const categories = categoriesResult.error
    ? []
    : categoriesResult.data.map((c) => ({ id: c.id, name: c.name }));
  const collections = collectionsResult.error
    ? []
    : collectionsResult.data.map((c) => ({ id: c.id, name: c.name }));
  const taxClasses = taxClassesResult.error ? [] : taxClassesResult.data;

  return (
    <div>
      <Link href="/products" className="text-sm">
        &larr; {tCreate("backToProducts")}
      </Link>
      <Heading level={1} className="mt-4">
        {tCreate("heading")}
      </Heading>
      <Text tone="muted" className="mt-2 max-w-2xl">
        {tCreate("intro")}
      </Text>
      <CreateProductForm categories={categories} collections={collections} taxClasses={taxClasses} />
    </div>
  );
}
