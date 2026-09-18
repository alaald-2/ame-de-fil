import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Heading, Text, Link, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../../lib/dal";
import { getServerApiClient } from "../../../../lib/server-api";
import { AdminTaxonomyDetailForm } from "../../../../components/admin-taxonomy-detail-form";

interface CategoryDetailPageProps {
  params: Promise<{ id: string }>;
}

// Real GET /admin/categories/:id data (categories.view-gated server-side).
// Mirrors the Products detail page's own "server-rendered shell, client
// island for the real mutation" shape — see admin-taxonomy-detail-form.tsx
// for the save/delete logic shared with the Collection detail page.
export default async function CategoryDetailPage({ params }: CategoryDetailPageProps) {
  const session = await requireSession();
  const { id } = await params;

  const t = await getTranslations("Content.categories");
  const td = await getTranslations("Content.categories.detail");
  const client = await getServerApiClient();
  const permissions = session.user.permissions;

  const {
    data: category,
    error,
    response,
  } = await client.GET("/api/v1/admin/categories/{id}", {
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

  const canManage = permissions.includes("categories.manage");
  const displayName =
    category.translations.find((tr) => tr.locale === "sv-SE")?.name ??
    category.translations[0]?.name ??
    category.id;

  return (
    <div>
      <Link href="/content" className="text-sm">
        &larr; {td("backToList")}
      </Link>

      <Heading level={1} className="mt-4">
        {displayName}
      </Heading>

      <div className="mt-8">
        <Heading level={2} className="mb-4">
          {td("detailsHeading")}
        </Heading>
        {canManage ? (
          <AdminTaxonomyDetailForm
            kind="categories"
            id={category.id}
            translations={category.translations}
            productCount={category.productCount}
            listBasePath="/content"
          />
        ) : (
          <Text size="sm" tone="muted">
            {td("readOnlyNotice")}
          </Text>
        )}
      </div>
    </div>
  );
}
