import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware Link/redirect/usePathname/useRouter — components that need
// active-nav-state styling compute it via this usePathname (which strips
// the locale prefix) and pass it to @ame-de-fil/ui's NavLink as a plain
// `active` boolean, keeping packages/ui decoupled from next-intl.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
