import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container, Heading, Text, Button, PlaceholderImage } from "@ame-de-fil/ui";
import { Link } from "../../../i18n/navigation";
import { api } from "../../../lib/api-client";
import type { AppLocale } from "../../../lib/locale";

type LocaleParams = { locale: AppLocale };

export async function generateMetadata({
  params,
}: {
  params: Promise<LocaleParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "About" });
  return { title: t("title") };
}

// The one real content page the homepage's own "Read our story" button
// already links to (page.tsx's storyCta) — was previously a dead link (no
// app/[locale]/about/page.tsx existed at all, a 404 on the nav item every
// page carries plus this homepage button). Reuses the same "story"
// homepage-section image as the homepage's own story block (same asset,
// same narrative) rather than inventing separate art direction for a
// single-purpose page, and reuses that section's already-established copy
// facts (Swedish atelier, made-to-order, no factories) rather than
// inventing new biographical/company specifics (founding year, headcount,
// address) that don't exist anywhere in this project.
export default async function AboutPage({ params }: { params: Promise<LocaleParams> }) {
  const { locale } = await params;
  const t = await getTranslations("About");

  const { data: homepageSections } = await api.GET("/api/v1/homepage-sections", {
    params: { query: { locale } },
  });
  const storyImageUrl = homepageSections?.find((section) => section.key === "story")?.imageUrl ?? null;

  return (
    <Container className="py-16">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
        {storyImageUrl ? (
          <img src={storyImageUrl} alt="" className="aspect-[4/5] w-full object-cover" />
        ) : (
          <PlaceholderImage className="aspect-[4/5] w-full" />
        )}
        <div>
          <Text size="sm" tone="muted" className="tracking-wide uppercase">
            {t("eyebrow")}
          </Text>
          <Heading level={1} className="mt-2">
            {t("title")}
          </Heading>
          <Text tone="muted" className="mt-4 max-w-md">
            {t("intro")}
          </Text>
          <Text tone="muted" className="mt-4 max-w-md">
            {t("body")}
          </Text>
          <Button asChild className="mt-6">
            <Link href="/shop">{t("cta")}</Link>
          </Button>
        </div>
      </div>
    </Container>
  );
}
