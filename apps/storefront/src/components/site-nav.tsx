"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  NavLink,
  Dialog,
  DialogTrigger,
  DialogContent,
  HamburgerMenuIcon,
  VisuallyHidden,
} from "@ame-de-fil/ui";
import { usePathname } from "../i18n/navigation";

// Client boundary exists only to know the current pathname for active-state
// styling (Server Components have no clean equivalent of usePathname in the
// App Router) — everything else in the storefront stays server-rendered.
//
// Below `lg`, the plain horizontal row (site-nav's only layout until now)
// had no fallback at all — 4 nav items just wrapped onto extra lines above
// the hero on a phone-width screen. Reuses the existing shared Dialog for
// the mobile menu rather than building a dedicated slide-in drawer: same
// centered-card pattern already used everywhere else in this design system,
// just holding a vertical nav list instead of a form.
export function SiteNav() {
  const t = useTranslations("Navigation");
  const tCommon = useTranslations("Common");
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const items = [
    { href: "/", label: t("home") },
    { href: "/shop", label: t("shop") },
    { href: "/collections", label: t("collections") },
    { href: "/about", label: t("about") },
  ] as const;

  function isActive(href: (typeof items)[number]["href"]): boolean {
    return pathname === href || (href !== "/" && pathname.startsWith(href));
  }

  return (
    <>
      <nav aria-label={t("home")} className="hidden items-center gap-6 lg:flex">
        {items.map((item) => (
          <NavLink key={item.href} href={item.href} active={isActive(item.href)}>
            {item.label}
          </NavLink>
        ))}
      </nav>

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
        <DialogContent title={tCommon("menu")} closeLabel={tCommon("close")}>
          <nav aria-label={t("home")} className="flex flex-col gap-4">
            {items.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                active={isActive(item.href)}
                onClick={() => setIsOpen(false)}
                className="text-base"
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </DialogContent>
      </Dialog>
    </>
  );
}
