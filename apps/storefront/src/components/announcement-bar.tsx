import { getTranslations, getLocale } from "next-intl/server";
import { Container } from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import type { AppLocale } from "../lib/locale";

// A thin, honest strip — no shipping-threshold promise (no such rule exists
// in ShippingMethod today, DATABASE.md §... it's flat-rate per method, not
// free-above-X). Falls back to the built-in brand line (the same
// Product.handmadeNotice-derived copy this always showed) whenever the
// admin hasn't set a custom message for the "announcement" homepage
// section (Admin ▸ Content ▸ Homepage ▸ Section content) — same
// null-means-default convention as every other homepage-section field.
export async function AnnouncementBar() {
  const t = await getTranslations("Announcement");
  const locale = (await getLocale()) as AppLocale;

  const { data: homepageSections } = await api.GET("/api/v1/homepage-sections", {
    params: { query: { locale } },
  });
  const message =
    homepageSections?.find((section) => section.key === "announcement")?.title ?? t("message");

  return (
    <div className="border-b border-neutral-200 bg-neutral-100">
      <Container>
        <p className="py-2 text-center font-sans text-xs tracking-wide text-neutral-600">
          {message}
        </p>
      </Container>
    </div>
  );
}
