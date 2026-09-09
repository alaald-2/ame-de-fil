"use client";

import { Alert } from "@ame-de-fil/ui";
import { useCart } from "./cart-provider";

// Renders the shared cart context's last error inline, wherever it's
// dropped into a page — lets Server Component pages (product detail, cart)
// surface add/update/remove failures (out of stock, insufficient stock)
// without becoming Client Components themselves.
export function CartErrorAlert() {
  const { errorMessage } = useCart();
  if (!errorMessage) return null;
  return (
    <Alert tone="danger" className="mt-4">
      {errorMessage}
    </Alert>
  );
}
