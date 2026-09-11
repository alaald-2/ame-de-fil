"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { NavLink } from "@ame-de-fil/ui";

// Exact-match tabs between four sibling routes under /inventory, not the
// prefix-match SidebarNav uses for its own top-level sections — each tab
// here is its own real page (own permission check, own data fetch), so
// "active" must mean "this one," never "this or a child of this."
export function InventoryTabs() {
  const t = useTranslations("Inventory");
  const pathname = usePathname();

  const tabs = [
    { href: "/inventory", label: t("tabOverview") },
    { href: "/inventory/low-stock", label: t("tabLowStock") },
    { href: "/inventory/reservations", label: t("tabReservations") },
    { href: "/inventory/movements", label: t("tabMovements") },
  ] as const;

  return (
    <nav aria-label={t("tabsLabel")} className="-mx-1 flex gap-4 overflow-x-auto border-b border-neutral-200 px-1">
      {tabs.map((tab) => (
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
    </nav>
  );
}
