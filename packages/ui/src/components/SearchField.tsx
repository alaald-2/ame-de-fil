"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { Input } from "./Input";
import { cn } from "../utils/cn";

export interface SearchFieldProps {
  /** Accessible name — not rendered, the placeholder carries the visible hint. */
  label: string;
  placeholder: string;
  /** The URL query param this reads/writes. Default "q" — every admin list uses the same name, so this only exists for the rare page where "q" collides with something else already in the URL. */
  paramName?: string;
  /** Debounce delay in ms before navigating. Enter/blur-via-submit navigates immediately regardless. */
  debounceMs?: number;
  className?: string;
}

// The one search input every admin list page uses (Products, Orders,
// Customers, Inventory's four tabs, Promotions, Users, Categories,
// Collections) — a single component so behavior and appearance never drift
// between pages.
//
// Deliberately self-contained: it reads and writes the URL's own search
// params directly (useSearchParams/usePathname/useRouter) instead of
// taking a `makeHref` callback from the page — a Server Component can't
// hand a plain function to a Client Component at all (React serialization
// boundary), which is exactly the shape a "let the caller build the href"
// API would have needed. Reading the *whole* current query string and only
// ever touching its own param plus deleting `page` is what makes "search
// preserves every other filter" and "search resets pagination to 1" true
// for free, on every page, without each one re-deriving that logic.
//
// useSearchParams() requires a Suspense boundary (Next.js's own
// constraint) — wrapped here so every call site gets that for free instead
// of remembering it themselves.
export function SearchField(props: SearchFieldProps) {
  return (
    <Suspense fallback={<SearchFieldFallback {...props} />}>
      <SearchFieldInner {...props} />
    </Suspense>
  );
}

function SearchFieldFallback({ label, placeholder, className }: SearchFieldProps) {
  return (
    <div className={cn("relative", className)}>
      <MagnifyingGlassIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-600"
      />
      <Input aria-label={label} placeholder={placeholder} className="pl-9" disabled />
    </div>
  );
}

function SearchFieldInner({
  label,
  placeholder,
  paramName = "q",
  debounceMs = 300,
  className,
}: SearchFieldProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentValue = searchParams.get(paramName) ?? "";
  const [value, setValue] = useState(currentValue);

  // Keep in sync with the URL when it changes some other way — a status
  // tab click, the browser's back/forward buttons — none of which go
  // through this input.
  useEffect(() => {
    setValue(currentValue);
  }, [currentValue]);

  function navigate(nextValue: string) {
    const params = new URLSearchParams(searchParams);
    const trimmed = nextValue.trim();
    if (trimmed) params.set(paramName, trimmed);
    else params.delete(paramName);
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if (value === currentValue) return;
    const timeout = setTimeout(() => navigate(value), debounceMs);
    return () => clearTimeout(timeout);
    // Re-running on every render of `navigate`/`searchParams` (new
    // identities each render) would defeat the debounce — only a real
    // value change should restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, debounceMs, currentValue]);

  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(event) => {
        event.preventDefault();
        navigate(value);
      }}
    >
      <MagnifyingGlassIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-600"
      />
      <Input
        type="search"
        aria-label={label}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        className="pl-9"
      />
    </form>
  );
}
