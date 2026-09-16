import { getTranslations } from "next-intl/server";
import { Container, Logo } from "@ame-de-fil/ui";
import { Link } from "../i18n/navigation";
import { getCurrentUser } from "../lib/dal";
import { AnnouncementBar } from "./announcement-bar";
import { DesktopNav, MobileNav } from "./site-nav";
import { HeaderSearch } from "./header-search";
import { LocaleSwitcher } from "./locale-switcher";
import { CartLink } from "./cart-link";
import { AccountMenu } from "./account-menu";

// Three rows, top to bottom, matching the reference's structure:
// announcement bar / [search — centered logo — market+locale+account+cart]
// / a separate centered nav row (desktop only; mobile folds nav into the
// hamburger drawer instead of a second row, same as the reference).
//
// The account icon now opens a dropdown (AccountMenu) rather than linking
// straight to /account, so this reads session state via getCurrentUser()
// (cache()-wrapped in lib/dal.ts — /account's own requireSession() call in
// the same request tree dedupes against this one, no extra network round
// trip). "Sweden · SEK" is a static label, not a working country switcher —
// ADR-021 fixes this storefront to a single Sweden/SEK market, so there is
// nothing to switch between; it exists only to match the reference's
// visual rhythm.
export async function Header() {
  const t = await getTranslations("Common");
  const tNav = await getTranslations("Navigation");
  const session = await getCurrentUser();
  const displayName = session
    ? [session.user.firstName, session.user.lastName].filter(Boolean).join(" ") ||
      session.user.email
    : null;

  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200 bg-neutral-50">
      <AnnouncementBar />
      <Container>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 py-6 lg:py-7">
          <div className="flex items-center">
            <div className="hidden lg:block">
              <HeaderSearch />
            </div>
            <div className="lg:hidden">
              <MobileNav />
            </div>
          </div>
          <Link href="/" className="justify-self-center hover:no-underline">
            <Logo height={38} />
          </Link>
          <div className="flex items-center justify-end gap-4 sm:gap-6">
            <div className="lg:hidden">
              <HeaderSearch align="right" />
            </div>
            <span className="hidden font-sans text-xs tracking-[0.08em] text-neutral-500 uppercase lg:inline">
              {t("market")}
            </span>
            <LocaleSwitcher />
            <AccountMenu displayName={displayName} />
            <div className="lg:hidden">
              <CartLink label={tNav("cart")} variant="icon" />
            </div>
            <div className="hidden lg:block">
              <CartLink label={tNav("cart")} />
            </div>
          </div>
        </div>
      </Container>
      <div className="hidden border-t border-neutral-200 lg:block">
        <Container>
          <div className="py-4">
            <DesktopNav />
          </div>
        </Container>
      </div>
    </header>
  );
}
