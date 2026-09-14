"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Heading, Text, Card, Spinner } from "@ame-de-fil/ui";
import { Link } from "../i18n/navigation";
import { api } from "../lib/api-client";

type VerifyState = "verifying" | "success" | "invalid";

function VerifyEmailInvalidCard() {
  const t = useTranslations("VerifyEmail");
  return (
    <div className="w-full max-w-sm">
      <Card className="p-8 text-center">
        <Heading level={2} className="mb-3">
          {t("invalidTitle")}
        </Heading>
        <Text tone="muted">{t("invalidMessage")}</Text>
        <Text size="sm" tone="muted" className="mt-4">
          {t("resendPrompt")}
        </Text>
      </Card>
    </div>
  );
}

// Fires POST /api/v1/auth/verify-email automatically on mount (the emailed
// link points at this page with ?token=...; the page itself does the real
// state-changing call, not the link/GET — see reset-password-form.tsx's
// identical comment for why). A ref guards against React StrictMode's
// double-invoke in development consuming the single-use token twice and
// showing a false "invalid" result on the very first real visit.
export function VerifyEmailPanel() {
  const t = useTranslations("VerifyEmail");
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<VerifyState>("verifying");
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current || !token) return;
    hasRun.current = true;

    api.POST("/api/v1/auth/verify-email", { body: { token } }).then(({ error }) => {
      setState(error ? "invalid" : "success");
    });
  }, [token]);

  // No token at all in the URL — nothing to verify, no request to make;
  // render the invalid state directly rather than routing it through
  // `state` (avoids a setState-in-effect for a value already known
  // synchronously from render).
  if (!token) {
    return <VerifyEmailInvalidCard />;
  }

  if (state === "invalid") {
    return <VerifyEmailInvalidCard />;
  }

  return (
    <div className="w-full max-w-sm">
      <Card className="p-8 text-center">
        {state === "verifying" ? (
          <>
            <Spinner className="mx-auto h-6 w-6" />
            <Text tone="muted" className="mt-4">
              {t("verifying")}
            </Text>
          </>
        ) : (
          <>
            <Heading level={2} className="mb-3">
              {t("successTitle")}
            </Heading>
            <Text tone="muted">{t("successMessage")}</Text>
            <Link
              href="/login"
              className="mt-6 inline-block font-sans text-sm font-medium text-neutral-900 underline underline-offset-4"
            >
              {t("goToLogin")}
            </Link>
          </>
        )}
      </Card>
    </div>
  );
}
