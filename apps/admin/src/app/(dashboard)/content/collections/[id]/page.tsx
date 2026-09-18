import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Heading, Text, Link, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../../../lib/dal";
import { getServerApiClient } from "../../../../../lib/server-api";
import { AdminTaxonomyDetailForm } from "../../../../../components/admin-taxonomy-detail-form";

interface CollectionDetailPageProps {
  params: Promise<{ id: string }>;
}

// Mirrors ../../[id]/page.tsx (Category detail) exactly, driving
// GET /admin/collections/:id instead.
export default async function CollectionDetailPage({ params }: CollectionDetailPageProps) {
  const session = await requireSession();
  const { id } = await params;

  const t = await getTranslations("Content.collections");
  const td = await getTranslations("Content.collections.detail");
  const client = await getServerApiClient();
  const permissions = session.user.permissions;

  const {
    data: collection,
    error,
    response,
  } = await client.GET("/api/v1/admin/collections/{id}", {
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

  const canManage = permissions.includes("collections.manage");
  const displayName =
    collection.translations.find((tr) => tr.locale === "sv-SE")?.name ??
    collection.translations[0]?.name ??
    collection.id;

  return (
    <div>
      <Link href="/content/collections" className="text-sm">
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
            kind="collections"
            id={collection.id}
            translations={collection.translations}
            productCount={collection.productCount}
            listBasePath="/content/collections"
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
