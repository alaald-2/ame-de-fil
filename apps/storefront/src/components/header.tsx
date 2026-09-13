import { getTranslations } from "next-intl/server";
import { Container, Logo, PersonIcon, VisuallyHidden } from "@ame-de-fil/ui";
import { Link } from "../i18n/navigation";
import { AnnouncementBar } from "./announcement-bar";
import { DesktopNav, MobileNav } from "./site-nav";
import { HeaderSearch } from "./header-search";
import { LocaleSwitcher } from "./locale-switcher";
import { CartLink } from "./cart-link";

// Three rows, top to bottom, matching the reference's structure:
// announcement bar / [search — centered logo — market+locale+account+cart]
// / a separate centered nav row (desktop only; mobile folds nav into the
// hamburger drawer instead of a second row, same as the reference).
//
// The account icon always points at /account regardless of session state —
// that page itself redirects a signed-out visitor to /login (lib/dal.ts's
// requireSession), so there's no need to know auth state here just to
// render a link; keeps this a Server Component with no session fetch of
// its own. "Sweden · SEK" is a static label, not a working country
// switcher — ADR-021 fixes this storefront to a single Sweden/SEK market,
// so there is nothing to switch between; it exists only to match the
// reference's visual rhythm.
export async function Header() {
  const t = await getTranslations("Common");
  const tNav = await getTranslations("Navigation");

  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200 bg-neutral-50">
      <AnnouncementBar />
      <Container>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-5">
          <div className="flex items-center">
            <div className="hidden lg:block">
              <HeaderSearch />
            </div>
            <div className="lg:hidden">
              <MobileNav />
            </div>
          </div>
          <Link href="/" className="justify-self-center hover:no-underline">
            <Logo height={30} />
          </Link>
          <div className="flex items-center justify-end gap-3 sm:gap-4">
            <div className="lg:hidden">
              <HeaderSearch align="right" />
            </div>
            <span className="hidden font-sans text-xs tracking-wide text-neutral-500 lg:inline">
              {t("market")}
            </span>
            <LocaleSwitcher />
            <Link
              href="/account"
              className="rounded-sm p-1 text-neutral-700 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            >
              <PersonIcon aria-hidden="true" className="h-5 w-5" />
              <VisuallyHidden>{tNav("account")}</VisuallyHidden>
            </Link>
            <CartLink label={tNav("cart")} />
          </div>
        </div>
      </Container>
      <div className="hidden border-t border-neutral-200 lg:block">
        <Container>
          <div className="py-3">
            <DesktopNav />
          </div>
        </Container>
      </div>
    </header>
  );
}
