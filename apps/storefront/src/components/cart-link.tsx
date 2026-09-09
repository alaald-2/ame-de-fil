"use client";

import { Link } from "../i18n/navigation";
import { useCart } from "./cart-provider";

// Client Component so the item count can update immediately after an
// add/remove elsewhere on the page, without a full navigation — the rest of
// header.tsx stays a Server Component.
export function CartLink({ label }: { label: string }) {
  const { cart } = useCart();

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
