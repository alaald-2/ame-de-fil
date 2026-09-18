"use client";

import { VisuallyHidden } from "@ame-de-fil/ui";
import { Link } from "../i18n/navigation";
import { useCart } from "./cart-provider";

// A plain outline bag, drawn locally rather than pulled from
// @radix-ui/react-icons (its set has no bag/cart glyph) — kept to that
// package's own 15x15/1px-stroke proportions so it sits flush next to
// CloseIcon/MagnifyingGlassIcon in the mobile drawer's header row.
function BagIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4.5 4V3.25C4.5 2.007 5.507 1 6.75 1H8.25C9.493 1 10.5 2.007 10.5 3.25V4M2.75 4H12.25L11.7 12.6C11.646 13.427 10.96 14.07 10.13 14.07H4.87C4.04 14.07 3.354 13.427 3.3 12.6L2.75 4Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Two visual forms of the same link + cart state — a text label for the
// desktop-style header row (default, unchanged) and an icon+badge form for
// the full-screen mobile drawer header (site-nav.tsx's MobileNav), which
// has no room next to the close/logo/search icons for a text label.
export function CartLink({
  label,
  variant = "text",
}: {
  label: string;
  variant?: "text" | "icon";
}) {
  const { cart } = useCart();

  if (variant === "icon") {
    return (
      <Link
        href="/cart"
        className="relative rounded-sm p-1.5 text-neutral-700 transition-colors duration-200 ease-out-slow hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        <BagIcon className="h-5 w-5" />
        {cart.itemCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute top-0.5 right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-neutral-900 text-[9px] leading-none text-neutral-50"
          >
            {cart.itemCount}
          </span>
        ) : null}
        <VisuallyHidden>
          {cart.itemCount > 0 ? `${label} (${cart.itemCount})` : label}
        </VisuallyHidden>
      </Link>
    );
  }

  return (
    <Link
      href="/cart"
      aria-label={cart.itemCount > 0 ? `${label} (${cart.itemCount})` : label}
      className="rounded-sm font-sans text-sm text-neutral-600 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
    >
      {label}
      {cart.itemCount > 0 ? ` (${cart.itemCount})` : null}
    </Link>
  );
}
