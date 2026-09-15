import { getTranslations } from "next-intl/server";
import { NavLink } from "@ame-de-fil/ui";

interface TaskViewTabsProps {
  current: "all" | "me" | "unassigned";
}

// Server-rendered tab strip, same shape/markup as ProductStatusTabs — "all"
// is the default (?view= absent), matching that component's own "All" tab
// convention rather than defaulting to a narrower view.
export async function TaskViewTabs({ current }: TaskViewTabsProps) {
  const t = await getTranslations("Tasks");

  const tabs = [
    { view: "all", href: "/tasks", label: t("viewAll") },
    { view: "me", href: "/tasks?view=me", label: t("viewMine") },
    { view: "unassigned", href: "/tasks?view=unassigned", label: t("viewUnassigned") },
  ] as const;

  return (
    <nav
      aria-label={t("viewsLabel")}
      className="-mx-1 flex items-center gap-4 overflow-x-auto border-b border-neutral-200 px-1"
    >
      {tabs.map((tab) => {
        const active = tab.view === current;
        return (
          <NavLink
            key={tab.view}
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
