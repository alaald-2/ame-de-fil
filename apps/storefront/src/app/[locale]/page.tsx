import { getTranslations } from "next-intl/server";
import { Container, Heading, Text, Button, PlaceholderImage, Reveal } from "@ame-de-fil/ui";
import { Link } from "../../i18n/navigation";
import { api } from "../../lib/api-client";
import { ProductCard } from "../../components/product-card";
import { HeroSlider } from "../../components/hero-slider";
import type { AppLocale } from "../../lib/locale";

// Image-led homepage (placeholder imagery until real catalog photography
// exists — DECISIONS.md ADR-020): a full-bleed hero, a "new arrivals" grid
// of real published products, then two alternating image/text sections —
// the reference site's own rhythm (heading band → edge-to-edge image →
// product grid → alternating story sections), reproduced with this
// storefront's real copy and real "made to order" capability
// (product-card.tsx's own `productionTimeDays` concept) rather than
// anything invented for the redesign.
export default async function HomePage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const t = await getTranslations("Home");

  const [{ data }, { data: heroSlides }, { data: homepageSections }] = await Promise.all([
    api.GET("/api/v1/products", { params: { query: { locale, page: 1, pageSize: 4 } } }),
    api.GET("/api/v1/hero-slides", { params: { query: { locale } } }),
    api.GET("/api/v1/homepage-sections", {}),
  ]);
  const newArrivals = data?.items ?? [];
  const activeHeroSlides = heroSlides ?? [];
  const storyImageUrl = homepageSections?.find((section) => section.key === "story")?.imageUrl ?? null;
  const madeToOrderImageUrl =
    homepageSections?.find((section) => section.key === "made-to-order")?.imageUrl ?? null;

  return (
    <>
      <div className="border-b border-neutral-200 py-14 text-center sm:py-20">
        <Container>
          <Reveal>
            <Heading level={1} className="mx-auto max-w-2xl">
              {t("heroTitle")}
            </Heading>
          </Reveal>
          <Reveal delay={80}>
            <Text size="lg" tone="muted" className="mx-auto mt-4 max-w-md">
              {t("heroSubtitle")}
            </Text>
          </Reveal>
        </Container>
      </div>

      <Reveal>
        {activeHeroSlides.length > 0 ? (
          <HeroSlider slides={activeHeroSlides} />
        ) : (
          // No hero slides configured yet (Admin → Content → Homepage Hero)
          // — keep today's premium placeholder + generic CTA rather than
          // rendering an empty band.
          <div className="relative aspect-[4/5] w-full overflow-hidden sm:aspect-[16/9] lg:aspect-[21/9]">
            <PlaceholderImage className="absolute inset-0 h-full w-full" />
            <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-neutral-900/15 to-transparent pb-10 sm:pb-14">
              <Button asChild>
                <Link href="/shop">{t("cta")}</Link>
              </Button>
            </div>
          </div>
        )}
      </Reveal>

      {newArrivals.length > 0 ? (
        <Container className="py-20">
          <Reveal>
            <Heading level={2}>{t("newArrivalsTitle")}</Heading>
          </Reveal>
          <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {newArrivals.map((product, index) => (
              <Reveal key={product.id} delay={Math.min(index, 8) * 60}>
                <ProductCard product={product} locale={locale} />
              </Reveal>
            ))}
          </div>
        </Container>
      ) : null}

      <Container className="flex flex-col gap-20 py-4 sm:py-8 lg:gap-28">
        <Reveal className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-16">
          {storyImageUrl ? (
            // Plain <img>, not next/image — same idiom as every other real
            // image in this app (product-card.tsx's own comment).
            <img src={storyImageUrl} alt="" className="aspect-[4/5] w-full object-cover" />
          ) : (
            <PlaceholderImage className="aspect-[4/5] w-full" />
          )}
          <div>
            <Text size="sm" tone="muted" className="tracking-wide uppercase">
              {t("storyEyebrow")}
            </Text>
            <Heading level={2} className="mt-2">
              {t("storyTitle")}
            </Heading>
            <Text tone="muted" className="mt-4 max-w-md">
              {t("storyBody")}
            </Text>
            <Button asChild variant="secondary" className="mt-6">
              <Link href="/about">{t("storyCta")}</Link>
            </Button>
          </div>
        </Reveal>

        <Reveal className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div className="lg:order-2">
            {madeToOrderImageUrl ? (
              <img src={madeToOrderImageUrl} alt="" className="aspect-[4/5] w-full object-cover" />
            ) : (
              <PlaceholderImage className="aspect-[4/5] w-full" />
            )}
          </div>
          <div className="lg:order-1">
            <Text size="sm" tone="muted" className="tracking-wide uppercase">
              {t("madeToOrderEyebrow")}
            </Text>
            <Heading level={2} className="mt-2">
              {t("madeToOrderTitle")}
            </Heading>
            <Text tone="muted" className="mt-4 max-w-md">
              {t("madeToOrderBody")}
            </Text>
            <Button asChild variant="secondary" className="mt-6">
              <Link href="/shop">{t("madeToOrderCta")}</Link>
            </Button>
          </div>
        </Reveal>
      </Container>
    </>
  );
}
