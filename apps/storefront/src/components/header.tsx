import { getTranslations } from "next-intl/server";
import { Container, Cluster } from "@ame-de-fil/ui";
import { Link } from "../i18n/navigation";
import { SiteNav } from "./site-nav";
import { LocaleSwitcher } from "./locale-switcher";
import { CartLink } from "./cart-link";

// Internal navigation uses the locale-aware `Link` from i18n/navigation.ts
// (next-intl's createNavigation), not @ame-de-fil/ui's Link — that one wraps
// plain next/link and isn't locale-prefix-aware. @ame-de-fil/ui's Link is
// for content that doesn't need locale prefixing (e.g. external links).
export async function Header() {
  const t = await getTranslations("Navigation");

  return (
    <header className="border-b border-neutral-200">
      <Container>
        <Cluster align="center" className="justify-between py-5">
          <Link href="/" className="font-display text-xl text-neutral-900 hover:no-underline">
            Âme de Fil
          </Link>
          <Cluster gap="lg">
            <SiteNav />
            <CartLink label={t("cart")} />
            <LocaleSwitcher />
          </Cluster>
        </Cluster>
      </Container>
    </header>
  );
}
