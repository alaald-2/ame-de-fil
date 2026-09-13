import { getTranslations } from "next-intl/server";
import { Container, Heading, Text, Logo } from "@ame-de-fil/ui";
import { Link } from "../i18n/navigation";

const LINK_STYLES =
  "rounded-sm font-sans text-sm text-neutral-600 transition-colors duration-300 ease-out-slow hover:text-neutral-900";

// Two real link columns (Shop, Customer service) instead of two bare links
// side by side — `customerService` already existed as a translation key
// with no caller before this, suggesting a column heading was planned but
// never wired up. No newsletter signup here: there's no subscribe endpoint
// anywhere in the API today, and a form that silently does nothing on
// submit would be worse than no form at all.
export async function Footer() {
  const t = await getTranslations("Footer");
  const tNav = await getTranslations("Navigation");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-neutral-200 bg-neutral-100 py-16">
      <Container className="flex flex-col gap-10 sm:flex-row sm:justify-between">
        <div>
          <Logo height={16} />
          <Text size="sm" tone="muted" className="mt-3 max-w-xs">
            {t("tagline")}
          </Text>
          <Text size="sm" tone="muted" className="mt-8">
            © {year} Âme de Fil. {t("rights")}
          </Text>
        </div>
        <div className="flex flex-wrap gap-10 sm:gap-16">
          <div>
            <Heading level={4}>{tNav("shop")}</Heading>
            <div className="mt-3 flex flex-col gap-2">
              <Link href="/shop" className={LINK_STYLES}>
                {tNav("shop")}
              </Link>
              <Link href="/collections" className={LINK_STYLES}>
                {tNav("collections")}
              </Link>
            </div>
          </div>
          <div>
            <Heading level={4}>{t("customerService")}</Heading>
            <div className="mt-3 flex flex-col gap-2">
              <Link href="/shipping" className={LINK_STYLES}>
                {t("shipping")}
              </Link>
              <Link href="/contact" className={LINK_STYLES}>
                {t("contact")}
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </footer>
  );
}
