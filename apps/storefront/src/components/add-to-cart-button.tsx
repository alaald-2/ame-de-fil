"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@ame-de-fil/ui";
import { useCart } from "./cart-provider";

export function AddToCartButton({
  variantId,
  available,
}: {
  variantId: string;
  available: boolean;
}) {
  const t = useTranslations("Cart");
  const { addItem } = useCart();
  const [status, setStatus] = useState<"idle" | "loading" | "added">("idle");

  if (!available) return null;

  async function handleClick() {
    setStatus("loading");
    const ok = await addItem(variantId, 1);
    setStatus(ok ? "added" : "idle");
    if (ok) setTimeout(() => setStatus("idle"), 1500);
  }

  return (
    <Button
      type="button"
      variant="primary"
      onClick={handleClick}
      disabled={status === "loading"}
      aria-live="polite"
    >
      {status === "added" ? t("added") : t("addToCart")}
    </Button>
  );
}
