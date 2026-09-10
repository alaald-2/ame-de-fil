"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Alert } from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";

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

    router.push("/login");
    router.refresh();
  }

  return (
    <div>
      {hasError ? (
        <Alert tone="danger" className="mb-2">
          {t("signOutError")}
        </Alert>
      ) : null}
      <Button variant="ghost" onClick={handleSignOut} disabled={isSigningOut}>
        {t("signOut")}
      </Button>
    </div>
  );
}
