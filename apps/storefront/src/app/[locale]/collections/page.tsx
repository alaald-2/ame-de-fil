import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container, Heading, Text } from "@ame-de-fil/ui";
import { api } from "../../../lib/api-client";
import { Link } from "../../../i18n/navigation";
import { CollectionsGallery, type GalleryTile } from "../../../components/collections-gallery";
import type { AppLocale } from "../../../lib/locale";

type PageParams = { locale: AppLocale };

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Navigation" });
  return { title: t("collections") };
}

export default async function CollectionsPage({ params }: { params: Promise<PageParams> }) {
  const { locale } = await params;
  const t = await getTranslations("Navigation");
  const tCollection = await getTranslations("Collection");

  const { data, error } = await api.GET("/api/v1/collections", { params: { query: { locale } } });
  if (error || !data) throw new Error("Failed to load collections");

  // Every image any collection has, flattened into one gallery — each tile
  // still carries its own collection's slug/name so it links and captions
  // correctly (design discussion). A collection with no product images yet
  // simply contributes nothing here; the plain list below still reaches it.
  const tiles: GalleryTile[] = data.flatMap((collection) =>
    collection.images.map((image, index) => ({
      id: `${collection.id}-${index}`,
      url: image.url,
      altText: image.altText,
      collectionSlug: collection.slug,
      collectionName: collection.name,
    })),
  );

  return (
    <Container className="py-16">
      <Heading level={1}>{t("collections")}</Heading>
      {data.length === 0 ? (
        <Text tone="muted" className="mt-4">
          {tCollection("empty")}
        </Text>
      ) : (
        <>
          <Text tone="muted" className="mt-3 max-w-xl">
            {tCollection("intro")}
          </Text>

          <div className="mt-10">
            <CollectionsGallery tiles={tiles} label={tCollection("galleryLabel")} />
          </div>

          <ul className="mt-12 flex flex-col gap-4 border-t border-neutral-200 pt-10">
            {data.map((collection) => (
              <li key={collection.id}>
                <Link
                  href={{ pathname: "/collections/[slug]", params: { slug: collection.slug } }}
                  className="font-display text-xl text-neutral-900 hover:text-accent-600"
                >
                  {collection.name}
                </Link>
                {collection.description ? (
                  <Text tone="muted" className="mt-1">
                    {collection.description}
                  </Text>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </Container>
  );
}
