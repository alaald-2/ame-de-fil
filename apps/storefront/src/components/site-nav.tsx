"use client";

import { useTranslations } from "next-intl";
import { NavLink } from "@ame-de-fil/ui";
import { usePathname } from "../i18n/navigation";

// Client boundary exists only to know the current pathname for active-state
// styling (Server Components have no clean equivalent of usePathname in the
// App Router) — everything else in the storefront stays server-rendered.
export function SiteNav() {
  const t = useTranslations("Navigation");
  const pathname = usePathname();

  const items = [
    { href: "/", label: t("home") },
    { href: "/shop", label: t("shop") },
    { href: "/collections", label: t("collections") },
    { href: "/about", label: t("about") },
  ] as const;

  return (
    <nav aria-label={t("home")} className="flex flex-wrap items-center gap-6">
      {items.map((item) => (
        <NavLink
          key={item.href}
          href={item.href}
          active={pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
