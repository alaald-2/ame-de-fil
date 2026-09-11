"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { NavLink } from "@ame-de-fil/ui";

interface ContentTabsProps {
  permissions: string[];
}

// Mirrors AdministrationTabs — Categories and Collections are gated by two
// genuinely separate permissions (categories.view/collections.view), so an
// admin holding only one may legitimately see only one tab, not a
// disabled/greyed-out second tab.
export function ContentTabs({ permissions }: ContentTabsProps) {
  const t = useTranslations("Content");
  const pathname = usePathname();

  const tabs = [
    { href: "/content", label: t("tabCategories"), permission: "categories.view" },
    { href: "/content/collections", label: t("tabCollections"), permission: "collections.view" },
  ] as const;

  const visibleTabs = tabs.filter((tab) => permissions.includes(tab.permission));
  if (visibleTabs.length === 0) return null;

  return (
    <nav aria-label={t("tabsLabel")} className="-mx-1 flex items-center gap-4 overflow-x-auto border-b border-neutral-200 px-1">
      {visibleTabs.map((tab) => (
        <NavLink
          key={tab.href}
          href={tab.href}
          active={pathname === tab.href}
          className={
            pathname === tab.href
              ? "border-b-2 border-neutral-900 px-1 pb-3 whitespace-nowrap"
              : "border-b-2 border-transparent px-1 pb-3 whitespace-nowrap"
          }
        >
          {tab.label}
        </NavLink>
      ))}
      {visibleTabs.length > 1 ? (
        <span aria-hidden="true" className="sticky right-0 ml-1 shrink-0 pr-1 pb-3 text-neutral-500 md:hidden">
          &rsaquo;
        </span>
      ) : null}
    </nav>
  );
}
