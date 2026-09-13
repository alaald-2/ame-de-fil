"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogTrigger,
  DrawerContent,
  NavLink,
  HamburgerMenuIcon,
  VisuallyHidden,
} from "@ame-de-fil/ui";
import { usePathname } from "../i18n/navigation";

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

// The header's own separate nav row (desktop only) — a plain centered list,
// no dialog/drawer machinery, matching the reference site's header having
// nav as its own row below the logo/icons rather than sharing a row with them.
export function DesktopNav() {
  const t = useTranslations("Navigation");
  const isActive = useIsActive();

  return (
    <nav aria-label={t("home")} className="hidden items-center justify-center gap-8 lg:flex">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} href={item.href} active={isActive(item.href)}>
          {t(item.key)}
        </NavLink>
      ))}
    </nav>
  );
}

// Below `lg`, a hamburger opens `DrawerContent` — a full-height panel
// sliding in from the right (animate-drawer-in/out, tokens.css), not the
// centered-card `DialogContent` — a nav list reads as a drawer everywhere
// this pattern exists (the reference site included), not as a form-sized
// modal.
export function MobileNav() {
  const t = useTranslations("Navigation");
  const tCommon = useTranslations("Common");
  const isActive = useIsActive();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-sm p-1 text-neutral-700 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 lg:hidden"
        >
          <HamburgerMenuIcon aria-hidden="true" className="h-5 w-5" />
          <VisuallyHidden>{tCommon("menu")}</VisuallyHidden>
        </button>
      </DialogTrigger>
      <DrawerContent title={tCommon("menu")} closeLabel={tCommon("close")}>
        <nav aria-label={t("home")} className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              active={isActive(item.href)}
              onClick={() => setIsOpen(false)}
              className="rounded-sm px-2 py-3 text-base"
            >
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
      </DrawerContent>
    </Dialog>
  );
}
