"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogTrigger,
  DialogClose,
  DrawerContent,
  NavLink,
  Logo,
  HamburgerMenuIcon,
  Cross2Icon,
  VisuallyHidden,
  cn,
} from "@ame-de-fil/ui";
import { Link, usePathname } from "../i18n/navigation";
import { HeaderSearch } from "./header-search";
import { CartLink } from "./cart-link";

// Client boundary exists only to know the current pathname for active-state
// styling (Server Components have no clean equivalent of usePathname in the
// App Router) — everything else in the storefront stays server-rendered.
const NAV_ITEMS = [
  { href: "/", key: "home" },
  { href: "/shop", key: "shop" },
  { href: "/collections", key: "collections" },
  { href: "/about", key: "about" },
] as const;

function useIsActive() {
  const pathname = usePathname();
  return (href: (typeof NAV_ITEMS)[number]["href"]) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));
}

// Underline sits on the anchor itself (not a wrapping `group`) since hover
// and the link's own hit area are the same element. `after:w-full` tracks
// the anchor's own (inline-block, so content-sized) width, which keeps the
// line under the letters rather than under any padding — "aligned with the
// text" per the design brief, not a full-row rule like the mobile drawer's.
const DESKTOP_LINK_CLASSES =
  "relative inline-block py-1 text-xs font-normal tracking-[0.14em] uppercase after:absolute after:-bottom-0.5 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-300 after:ease-out-slow after:content-[''] hover:after:scale-x-100";

// The header's own separate nav row (desktop only) — a plain centered list,
// no dialog/drawer machinery, matching the reference site's header having
// nav as its own row below the logo/icons rather than sharing a row with them.
export function DesktopNav() {
  const t = useTranslations("Navigation");
  const isActive = useIsActive();

  return (
    <nav aria-label={t("home")} className="hidden items-center justify-center gap-12 lg:flex">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <NavLink
            key={item.href}
            href={item.href}
            active={active}
            className={cn(DESKTOP_LINK_CLASSES, active && "after:scale-x-100")}
          >
            {t(item.key)}
          </NavLink>
        );
      })}
    </nav>
  );
}

// NavLink hard-codes "font-sans text-sm" in its own base string; `cn`'s
// plain (unextended) `twMerge` only knows Tailwind's built-in font-family/
// font-size groups, not this project's custom `font-display`/`text-3xl`
// theme keys, so it can't be trusted to resolve that conflict by dropping
// the base classes. Kept off the anchor entirely instead: only "block py-1"
// goes on NavLink's own className (a plain display/spacing change, nothing
// `font-sans`/`text-sm` would compete with), and every typographic override
// lives on this wrapping span, where a directly-applied class always wins
// over an inherited one regardless of stylesheet order. The underline is
// content-width here (`inline-block`, not the row's full block width) so it
// still sits under the letters — "aligned with the text" — even though each
// row's own tap target (the block-level anchor) is full-width.
const DRAWER_LINK_CLASSES = "block py-1";
const DRAWER_LINK_UNDERLINE_CLASSES =
  "relative inline-block font-display text-3xl font-normal tracking-wide after:absolute after:-bottom-1 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-300 after:ease-out-slow after:content-[''] hover:after:scale-x-100 sm:text-4xl";

// Below `lg`, a hamburger opens `DrawerContent` — a full-viewport panel
// sliding in from the left (animate-drawer-in/out, tokens.css) that
// dominates the screen, editorial-menu style, rather than a narrow inset
// sidebar. Its header row duplicates search/cart next to the close icon
// (both already reachable from the main header, which this panel fully
// covers) so a visitor doesn't have to close the menu first to use them.
export function MobileNav() {
  const t = useTranslations("Navigation");
  const tCommon = useTranslations("Common");
  const isActive = useIsActive();
  const [isOpen, setIsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-sm p-1.5 text-neutral-700 transition-colors duration-200 ease-out-slow hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 lg:hidden"
        >
          <HamburgerMenuIcon aria-hidden="true" className="h-5 w-5" />
          <VisuallyHidden>{tCommon("menu")}</VisuallyHidden>
        </button>
      </DialogTrigger>
      <DrawerContent
        title={tCommon("menu")}
        // The nested HeaderSearch panel handles its own Escape key to close
        // just itself, but Radix's DismissableLayer checks this Dialog's
        // Escape handling first (capture phase, ahead of that panel's own
        // bubble-phase listener) — without this, Escape while the panel is
        // open closes the whole drawer instead of only the search panel.
        onEscapeKeyDown={(event) => {
          if (isSearchOpen) event.preventDefault();
        }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-6 py-5 sm:px-10">
          <DialogClose className="rounded-sm p-1.5 text-neutral-700 transition-colors duration-200 ease-out-slow hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
            <Cross2Icon aria-hidden="true" className="h-5 w-5" />
            <VisuallyHidden>{tCommon("close")}</VisuallyHidden>
          </DialogClose>
          <Link href="/" onClick={() => setIsOpen(false)} className="hover:no-underline">
            <Logo height={40} />
          </Link>
          <div className="flex items-center gap-1">
            <HeaderSearch align="right" onOpenChange={setIsSearchOpen} />
            <CartLink label={t("cart")} variant="icon" />
          </div>
        </div>
        <nav
          aria-label={t("home")}
          className="flex flex-1 flex-col justify-center gap-8 px-8 py-12 sm:gap-10 sm:px-12"
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <NavLink
                key={item.href}
                href={item.href}
                active={active}
                onClick={() => setIsOpen(false)}
                className={DRAWER_LINK_CLASSES}
              >
                <span className={cn(DRAWER_LINK_UNDERLINE_CLASSES, active && "after:scale-x-100")}>
                  {t(item.key)}
                </span>
              </NavLink>
            );
          })}
        </nav>
      </DrawerContent>
    </Dialog>
  );
}
