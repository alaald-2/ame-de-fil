import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container, Heading, Text } from "@ame-de-fil/ui";
import { api } from "../../../lib/api-client";
import { Link } from "../../../i18n/navigation";
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

  return (
    <Container className="py-16">
      <Heading level={1}>{t("collections")}</Heading>
      {data.length === 0 ? (
        <Text tone="muted" className="mt-4">
          {tCollection("empty")}
        </Text>
      ) : (
        <ul className="mt-10 flex flex-col gap-4">
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
      )}
    </Container>
  );
}
