"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { NavLink } from "@ame-de-fil/ui";

// Client boundary only for active-pathname awareness (same rationale as
// storefront's site-nav.tsx) — admin has no locale URL segment to strip,
// so this uses next/navigation directly rather than a next-intl wrapper.
export function SidebarNav() {
  const t = useTranslations("Navigation");
  const pathname = usePathname();

  const items = [
    { href: "/", label: t("dashboard") },
    { href: "/products", label: t("products") },
    { href: "/orders", label: t("orders") },
    { href: "/inventory", label: t("inventory") },
    { href: "/customers", label: t("customers") },
    { href: "/content", label: t("content") },
    { href: "/administration", label: t("administration") },
  ] as const;

  return (
    <nav aria-label={t("dashboard")} className="flex flex-col gap-1">
      {items.map((item) => (
        <NavLink
          key={item.href}
          href={item.href}
          active={pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))}
          className="rounded-sm px-3 py-2 hover:bg-neutral-100"
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
