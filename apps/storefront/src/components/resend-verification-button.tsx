"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Text, Alert } from "@ame-de-fil/ui";
import { api } from "../lib/api-client";

type ResendState = "idle" | "sending" | "sent" | "error";

// Self-contained (no props) so it can be dropped into both the account
// page's unverified banner and checkout's EmailNotVerified error state
// without either caller having to plumb the current user's email down to
// it — it resolves its own identity via GET /api/v1/auth/session first.
// Both real usage sites are only ever reachable while already
// authenticated (there's no anonymous path to either), so a missing
// session here would be a genuine bug elsewhere, not a state this button
// needs a dedicated UI for.
export function ResendVerificationButton() {
  const t = useTranslations("Account");
  const [state, setState] = useState<ResendState>("idle");

  async function handleClick() {
    setState("sending");

    const { data: session } = await api.GET("/api/v1/auth/session");
    if (!session?.authenticated) {
      setState("error");
      return;
    }

    const { error } = await api.POST("/api/v1/auth/resend-verification", {
      body: { email: session.user.email },
    });

    setState(error ? "error" : "sent");
  }

  if (state === "sent") {
    return (
      <Text size="sm" tone="muted">
        {t("resendSent")}
      </Text>
    );
  }

  return (
    <div>
      {state === "error" ? (
        <Alert tone="danger" className="mb-2">
          {t("resendError")}
        </Alert>
      ) : null}
      <Button variant="secondary" onClick={handleClick} disabled={state === "sending"}>
        {t("resendVerification")}
      </Button>
    </div>
  );
}
