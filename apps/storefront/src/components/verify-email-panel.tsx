"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Heading, Text, Card, Spinner, Button } from "@ame-de-fil/ui";
import { Link } from "../i18n/navigation";
import { api } from "../lib/api-client";

type VerifyState = "verifying" | "success" | "invalid" | "error";

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

  async function runVerification(currentToken: string) {
    setState("verifying");
    try {
      const { error } = await api.POST("/api/v1/auth/verify-email", {
        body: { token: currentToken },
      });
      setState(error ? "invalid" : "success");
    } catch {
      // Distinct from "invalid": the request never reached the API at all
      // (offline, unreachable) — the token itself may still be perfectly
      // valid and unused (a POST, not a GET, so an unreached request can't
      // have burned it), so this must not claim the link is invalid/expired.
      // Previously uncaught, this left the page stuck on its spinner forever.
      setState("error");
    }
  }

  useEffect(() => {
    if (hasRun.current || !token) return;
    hasRun.current = true;
    void runVerification(token);
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

  if (state === "error") {
    return (
      <div className="w-full max-w-sm">
        <Card className="p-8 text-center">
          <Heading level={2} className="mb-3">
            {t("networkErrorTitle")}
          </Heading>
          <Text tone="muted">{t("networkErrorMessage")}</Text>
          <Button variant="secondary" className="mt-6" onClick={() => void runVerification(token)}>
            {t("retry")}
          </Button>
        </Card>
      </div>
    );
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
