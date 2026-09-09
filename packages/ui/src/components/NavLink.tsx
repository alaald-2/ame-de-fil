import NextLink from "next/link";
import { type ComponentPropsWithoutRef } from "react";
import { cn } from "../utils/cn";

interface NavLinkProps extends ComponentPropsWithoutRef<typeof NextLink> {
  active?: boolean;
}

// `active` is computed by the caller — typically via next-intl's
// locale-aware usePathname — rather than derived here, so packages/ui
// doesn't need to depend on next-intl to style an active nav item correctly.
export function NavLink({ active, className, ...props }: NavLinkProps) {
  return (
    <NextLink
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-sm font-sans text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500",
        active ? "font-medium text-neutral-900" : "text-neutral-600 hover:text-neutral-900",
        className,
      )}
      {...props}
    />
  );
}
