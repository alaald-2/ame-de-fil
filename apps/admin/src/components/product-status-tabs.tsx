import { getTranslations } from "next-intl/server";
import { NavLink } from "@ame-de-fil/ui";

interface ProductStatusTabsProps {
  current?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
}

// A server-rendered variant of InventoryTabs/ContentTabs's own tab-strip
// pattern (same markup/classes), not a client component — "active" here is
// a query param (?status=), not the route itself, so it's computed by the
// server page from its own already-parsed searchParams instead of
// usePathname. Filtering to one status is what makes an ever-growing
// catalog navigable once ARCHIVED products can no longer be deleted away
// (see admin-products.service.ts's deleteProduct: sold/carted products stay
// forever by design) — "All" is still the default so nothing is hidden
// unless the admin asks for it.
export async function ProductStatusTabs({ current }: ProductStatusTabsProps) {
  const t = await getTranslations("Products");

  const tabs = [
    { status: undefined, href: "/products", label: t("tabAll") },
    { status: "DRAFT", href: "/products?status=DRAFT", label: t("status.DRAFT") },
    { status: "PUBLISHED", href: "/products?status=PUBLISHED", label: t("status.PUBLISHED") },
    { status: "ARCHIVED", href: "/products?status=ARCHIVED", label: t("status.ARCHIVED") },
  ] as const;

  return (
    <nav
      aria-label={t("tabsLabel")}
      className="-mx-1 flex items-center gap-4 overflow-x-auto border-b border-neutral-200 px-1"
    >
      {tabs.map((tab) => {
        const active = tab.status === current;
        return (
          <NavLink
            key={tab.label}
            href={tab.href}
            active={active}
            className={
              active
                ? "border-b-2 border-neutral-900 px-1 pb-3 whitespace-nowrap"
                : "border-b-2 border-transparent px-1 pb-3 whitespace-nowrap"
            }
          >
            {tab.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
