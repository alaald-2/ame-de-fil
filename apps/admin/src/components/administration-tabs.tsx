"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { NavLink } from "@ame-de-fil/ui";

interface AdministrationTabsProps {
  permissions: string[];
}

// Unlike InventoryTabs (one permission gates all four tabs), Users and
// Audit log are gated by two genuinely separate permissions
// (users.view/audit.view — SidebarNav's own REQUIRED_PERMISSIONS already
// reflects this by requiring only one of the two for the section to be
// reachable at all) — an admin holding only one may legitimately see only
// one tab here, not a disabled/greyed-out second tab.
export function AdministrationTabs({ permissions }: AdministrationTabsProps) {
  const t = useTranslations("Administration");
  const pathname = usePathname();

  const tabs = [
    { href: "/administration", label: t("tabUsers"), permission: "users.view" },
    { href: "/administration/audit-log", label: t("tabAuditLog"), permission: "audit.view" },
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
      {/* Same "more to scroll" hint as SidebarNav/InventoryTabs — see
          sidebar-nav.tsx for the full rationale. Harmless when the visible
          tabs already fit (today's two-tab case): it just settles in-flow
          right after the last tab instead of pinning to an edge. */}
      {visibleTabs.length > 1 ? (
        <span aria-hidden="true" className="sticky right-0 ml-1 shrink-0 pr-1 pb-3 text-neutral-500 md:hidden">
          &rsaquo;
        </span>
      ) : null}
    </nav>
  );
}
