import NextLink from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { Text } from "./Text";
import { cn } from "../utils/cn";

interface PaginationProps {
  page: number;
  totalPages: number;
  /** Builds the href for a given page number — the caller owns the route/query shape. */
  makeHref: (page: number) => string;
  /** Accessible labels — caller-provided so this stays translation-agnostic. */
  previousLabel: string;
  nextLabel: string;
  pageLabel: (page: number, totalPages: number) => string;
  className?: string;
}

// Plain previous/next + "Page X of Y" — not a wall of numbered buttons.
// This project's lists are capped at 50 rows/page (pagination.schema.ts),
// so page counts stay small; a numbered strip would be decoration, not
// navigation. Pure links (no client JS) since every list here is a Server
// Component reading `?page=` — Next's own pending-navigation UI covers the
// in-between state.
export function Pagination({
  page,
  totalPages,
  makeHref,
  previousLabel,
  nextLabel,
  pageLabel,
  className,
}: PaginationProps) {
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav aria-label={pageLabel(page, totalPages)} className={cn("flex items-center justify-between gap-4", className)}>
      <PaginationLink href={hasPrevious ? makeHref(page - 1) : undefined} disabled={!hasPrevious}>
        <ChevronLeftIcon aria-hidden="true" className="h-4 w-4" />
        {previousLabel}
      </PaginationLink>
      {/* Not tone="muted" (--color-neutral-500 on neutral-50 is a known,
          pre-existing 3.78:1 contrast failure below the 4.5:1 AA minimum for
          normal text — tracked separately, out of scope to fix in shared
          tokens this checkpoint); neutral-600 keeps the same quiet weight
          while passing AA (5.98:1). */}
      <Text size="sm" className="text-neutral-600">
        {pageLabel(page, totalPages)}
      </Text>
      <PaginationLink href={hasNext ? makeHref(page + 1) : undefined} disabled={!hasNext}>
        {nextLabel}
        <ChevronRightIcon aria-hidden="true" className="h-4 w-4" />
      </PaginationLink>
    </nav>
  );
}

function PaginationLink({
  href,
  disabled,
  children,
}: {
  href?: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const classes =
    "inline-flex items-center gap-1.5 rounded-sm px-2 py-1.5 font-sans text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500";
  if (disabled) {
    // neutral-400 (2.39:1) fails AA outright; neutral-600 (5.98:1) still
    // reads as visibly dimmer than the active neutral-700 links below.
    return <span className={cn(classes, "text-neutral-600")}>{children}</span>;
  }
  return (
    <NextLink href={href as string} className={cn(classes, "text-neutral-700 hover:text-neutral-900")}>
      {children}
    </NextLink>
  );
}
