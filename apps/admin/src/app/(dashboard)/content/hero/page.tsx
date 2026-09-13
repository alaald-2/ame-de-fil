import { getTranslations } from "next-intl/server";
import { Heading, Text, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../../lib/dal";
import { getServerApiClient } from "../../../../lib/server-api";
import { ContentTabs } from "../../../../components/content-tabs";
import { HeroSlidesForm } from "../../../../components/hero-slides-form";
import { HomepageSectionImageForm } from "../../../../components/homepage-section-image-form";

// Real GET /admin/hero-slides + GET /admin/homepage-sections data
// (marketing.view-gated server-side) — the third tab of the Content
// section, sibling to Categories/Collections. Hero slides are a flat,
// unpaginated list (a homepage hero realistically never holds more than a
// handful of slides) rather than the Search/Pagination shape Categories/
// Collections use; homepage sections are always exactly the two known
// slots (HomepageSection's own schema comment), not a list at all.
export default async function HeroSlidesPage() {
  const session = await requireSession();
  const t = await getTranslations("Content.hero");
  const tSections = await getTranslations("Content.homepageImages");
  const tNav = await getTranslations("Navigation");
  const client = await getServerApiClient();
  const permissions = session.user.permissions;

  const [heroSlidesResult, homepageSectionsResult] = await Promise.all([
    client.GET("/api/v1/admin/hero-slides"),
    client.GET("/api/v1/admin/homepage-sections"),
  ]);
  const { data, error, response } = heroSlidesResult;

  if (error || homepageSectionsResult.error) {
    const errorResponse = error ? response : homepageSectionsResult.response;
    return (
      <div>
        <Heading level={1}>{tNav("content")}</Heading>
        <div className="mt-6">
          <ContentTabs permissions={permissions} />
        </div>
        {errorResponse.status === 403 ? (
          <ErrorState className="mt-6" title={t("forbiddenTitle")} description={t("forbiddenDescription")} />
        ) : (
          <ErrorState className="mt-6" title={t("errorTitle")} description={t("errorDescription")} />
        )}
      </div>
    );
  }

  const canManage = permissions.includes("marketing.manage");
  const sections = homepageSectionsResult.data;
  const storySection = sections.find((section) => section.key === "story");
  const madeToOrderSection = sections.find((section) => section.key === "made-to-order");

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <Heading level={1}>{tNav("content")}</Heading>
        <Text tone="muted">{t("resultsCount", { count: data.length })}</Text>
      </div>

      <div className="mt-6">
        <ContentTabs permissions={permissions} />
      </div>

      <Text tone="muted" className="mt-4 max-w-2xl">
        {t("sectionDescription")}
      </Text>

      <div className="mt-6">
        <HeroSlidesForm slides={data} canManage={canManage} />
      </div>

      <Heading level={2} className="mt-12">
        {tSections("heading")}
      </Heading>
      <Text tone="muted" className="mt-2 max-w-2xl">
        {tSections("description")}
      </Text>
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <HomepageSectionImageForm
          slug="story"
          label={tSections("storyLabel")}
          imageUrl={storySection?.imageUrl ?? null}
          canManage={canManage}
        />
        <HomepageSectionImageForm
          slug="made-to-order"
          label={tSections("madeToOrderLabel")}
          imageUrl={madeToOrderSection?.imageUrl ?? null}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
