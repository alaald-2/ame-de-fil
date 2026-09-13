"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Alert } from "@ame-de-fil/ui";
import { useRouter } from "../i18n/navigation";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";

// Mirrors apps/admin/src/components/sign-out-button.tsx exactly (same
// backend endpoint, same CSRF header) — router.push/refresh here goes
// through the locale-aware navigation hook since this app has real
// localized pathnames, unlike admin.
export function SignOutButton() {
  const t = useTranslations("Common");
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function handleSignOut() {
    setHasError(false);
    setIsSigningOut(true);

    const { error } = await api.POST("/api/v1/auth/logout", {
      headers: { "x-csrf-token": readCsrfCookie() },
    });

    setIsSigningOut(false);

    if (error) {
      setHasError(true);
      return;
    }

    router.push("/");
    router.refresh();
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
