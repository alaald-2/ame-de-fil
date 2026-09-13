import { getTranslations } from "next-intl/server";
import { Container } from "@ame-de-fil/ui";

// A thin, honest strip — no shipping-threshold promise (no such rule exists
// in ShippingMethod today, DATABASE.md §... it's flat-rate per method, not
// free-above-X), just the brand line already used elsewhere
// (Product.handmadeNotice) restated for the top of every page.
export async function AnnouncementBar() {
  const t = await getTranslations("Announcement");

  return (
    <div className="border-b border-neutral-200 bg-neutral-100">
      <Container>
        <p className="py-2 text-center font-sans text-xs tracking-wide text-neutral-600">
          {t("message")}
        </p>
      </Container>
    </div>
  );
}
