import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import NextLink from "next/link";
import { cn } from "../utils/cn";
import { VisuallyHidden } from "./VisuallyHidden";

// A plain, semantic table — no sorting/filtering chrome, since nothing here
// has a real consumer yet (DESIGN_SYSTEM.md §8's admin density, not a
// generic data-grid library). Hairline borders only, no zebra striping —
// restrained per the brand direction, not a stock admin-dashboard look.
export function Table({ className, ...props }: ComponentPropsWithoutRef<"table">) {
  return (
    <table
      className={cn("w-full border-collapse text-left font-sans text-sm", className)}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentPropsWithoutRef<"thead">) {
  return <thead className={cn("border-b border-neutral-300", className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentPropsWithoutRef<"tbody">) {
  return <tbody className={cn("divide-y divide-neutral-200", className)} {...props} />;
}

interface TableRowProps extends ComponentPropsWithoutRef<"tr"> {
  // Row-level hover/focus affordance — set when the row contains a
  // TableRowLink, so the whole row visibly responds even though only one
  // real link element lives inside it.
  interactive?: boolean;
}

export function TableRow({ interactive, className, ...props }: TableRowProps) {
  return (
    <tr
      className={cn(interactive && "relative transition-colors hover:bg-neutral-100/60", className)}
      {...props}
    />
  );
}

export function TableHeaderCell({ className, ...props }: ComponentPropsWithoutRef<"th">) {
  return (
    <th
      scope="col"
      // neutral-600, not neutral-500 (--color-neutral-500 on neutral-50 is
      // a known 3.78:1 contrast failure, below the 4.5:1 AA minimum —
      // tracked separately, out of scope for shared-token changes this
      // checkpoint) — neutral-600 passes AA (5.98:1) at this small size.
      className={cn(
        "px-4 py-3 font-sans text-xs font-medium tracking-wide text-neutral-600 uppercase",
        className,
      )}
      {...props}
    />
  );
}

interface TableCellProps extends ComponentPropsWithoutRef<"td"> {
  // Right-aligned tabular figures (order counts, money) instead of the
  // default left-aligned prose — a considered detail for a table that
  // mixes text and numbers, not the default browser table look.
  numeric?: boolean;
}

export function TableCell({ numeric, className, ...props }: TableCellProps) {
  return (
    <td
      className={cn(
        "px-4 py-3 align-middle text-neutral-800",
        numeric && "text-right tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

interface TableRowLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
}

// The accessible "whole row is a link" pattern: one real anchor, absolutely
// positioned to cover the entire row (its containing block is the
// `position: relative` TableRow, not this cell), so keyboard users Tab to
// exactly one stop per row and mouse users can click anywhere in it. Place
// as the first thing inside the row's first TableCell. `children` here is
// the link's accessible name only (visually hidden) — the row's real,
// visible content is the surrounding cells, read normally by a screen
// reader navigating the table cell by cell.
export function TableRowLink({ href, children, className }: TableRowLinkProps) {
  return (
    <NextLink
      href={href}
      className={cn(
        "absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500",
        className,
      )}
    >
      <VisuallyHidden>{children}</VisuallyHidden>
    </NextLink>
  );
}
