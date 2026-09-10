"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Alert } from "@ame-de-fil/ui";
import { api } from "../lib/api-client";

// Non-httpOnly by design (packages/config/src/env.ts CSRF_COOKIE_NAME
// default) specifically so client-side JS can read it for the double-submit
// header CsrfGuard checks against the cookie — the same contract the
// eventual mutating admin forms (refunds, inventory adjustments, RBAC
// changes) will also need, so this is the first real consumer, not a
// one-off. CsrfGuard's own header name is a hardcoded constant
// (csrf.guard.ts), not env-configurable, so it's hardcoded here too.
const CSRF_COOKIE_NAME = "ame_csrf";

function readCsrfCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function SignOutButton() {
  const t = useTranslations("Common");
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function handleSignOut() {
    setHasError(false);
    setIsSigningOut(true);

    const { error } = await api.POST("/api/v1/auth/logout", {
      headers: { "x-csrf-token": readCsrfCookie() ?? "" },
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
