"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Alert } from "@ame-de-fil/ui";
import { useRouter } from "../i18n/navigation";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";
import { useCart } from "./cart-provider";

// Mirrors apps/admin/src/components/sign-out-button.tsx exactly (same
// backend endpoint, same CSRF header) — router.push/refresh here goes
// through the locale-aware navigation hook since this app has real
// localized pathnames, unlike admin.
export function SignOutButton() {
  const t = useTranslations("Common");
  const router = useRouter();
  const { refresh: refreshCart } = useCart();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function handleSignOut() {
    setHasError(false);
    setIsSigningOut(true);

    try {
      const { error } = await api.POST("/api/v1/auth/logout", {
        headers: { "x-csrf-token": readCsrfCookie() },
      });

      if (error) {
        setHasError(true);
        return;
      }

      // The cart's own CartStore lives for the whole session (mounted once in
      // the root layout) — router.refresh() only re-fetches the current
      // route's Server Component payload, it never touches that client-side
      // store. Without this, the outgoing customer's cart stayed on screen
      // (header badge, /cart page) after sign-out, now representing a
      // different session, until an unrelated add/remove forced a refetch.
      void refreshCart();
      router.push("/");
      router.refresh();
    } catch {
      // A rejected fetch (offline, unreachable API) isn't the typed
      // {error} shape above — without this, isSigningOut never reset.
      setHasError(true);
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div>
      {hasError ? (
        <Alert tone="danger" className="mb-2">
          {t("signOutError")}
        </Alert>
      ) : null}
      <Button variant="secondary" onClick={handleSignOut} disabled={isSigningOut}>
        {t("signOut")}
      </Button>
    </div>
  );
}
