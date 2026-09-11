"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { NavLink } from "@ame-de-fil/ui";

interface SidebarNavProps {
  permissions: string[];
}

// Permission keys as guarded server-side (RequirePermissions decorator on
// each admin controller) — kept explicit here rather than derived, since
// nav visibility is only ever a UX convenience, not the real access
// boundary (the backend rejects an unauthorized request regardless of
// whether its nav link was ever shown). Products/Content have no
// corresponding *.view permission on the backend at all (they're still
// ComingSoon shells with no real data to gate), so they stay ungated.
const REQUIRED_PERMISSIONS: Partial<Record<string, string[]>> = {
  "/": ["dashboard.view"],
  "/orders": ["orders.view"],
  "/inventory": ["inventory.view"],
  "/customers": ["customers.view"],
  "/administration": ["users.view", "audit.view"],
};

// Client boundary only for active-pathname awareness (same rationale as
// storefront's site-nav.tsx) — admin has no locale URL segment to strip,
// so this uses next/navigation directly rather than a next-intl wrapper.
export function SidebarNav({ permissions }: SidebarNavProps) {
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

  const visibleItems = items.filter((item) => {
    const required = REQUIRED_PERMISSIONS[item.href];
    return !required || required.some((permission) => permissions.includes(permission));
  });

  return (
    <nav
      aria-label={t("dashboard")}
      className="-mx-1 mt-3 flex items-center gap-1 overflow-x-auto px-1 md:mx-0 md:mt-0 md:flex-col md:items-stretch md:overflow-visible md:px-0"
    >
      {visibleItems.map((item) => (
        <NavLink
          key={item.href}
          href={item.href}
          active={pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))}
          className="rounded-sm px-3 py-2 whitespace-nowrap hover:bg-neutral-100"
        >
          {item.label}
        </NavLink>
      ))}
      {/* "More to scroll" hint for the horizontal mobile row only (this
          nav becomes a vertical column at md+, where it never overflows).
          A plain character, not an icon library — matches this codebase's
          existing convention of plain HTML entities for small glyphs
          (&larr;/&times; elsewhere) rather than adding an icon dependency.
          `sticky right-0` pins it to the visible edge while there's still
          more to scroll, then settles in-flow right after the last item
          once the row is short enough to fit or is scrolled to the end —
          it never overlays real content. */}
      <span
        aria-hidden="true"
        className="sticky right-0 ml-1 shrink-0 pr-1 text-neutral-500 md:hidden"
      >
        &rsaquo;
      </span>
    </nav>
  );
}
