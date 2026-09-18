"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Alert, Spinner } from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";

interface UserStatusActionProps {
  userId: string;
  status: string;
}

type ErrorKind = "lastRoleManager" | "conflict" | "generic" | null;

// Exactly one action ever applies for a given status (same "one control,
// not a row of buttons only one of which could succeed" posture as
// OrderFulfillmentActions) — self-targeting is blocked entirely server-side
// (admin-users.service.ts's isSelfTarget), so the caller (the detail page)
// simply never renders this for the signed-in admin's own user id.
export function UserStatusAction({ userId, status }: UserStatusActionProps) {
  const t = useTranslations("Administration.detail");
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);

  async function handleClick() {
    setErrorKind(null);
    setIsSubmitting(true);

    const path =
      status === "ACTIVE"
        ? "/api/v1/admin/users/{id}/deactivate"
        : "/api/v1/admin/users/{id}/activate";
    const { error, response } = await api.POST(path, {
      params: { path: { id: userId } },
      headers: { "x-csrf-token": readCsrfCookie() },
    });

    setIsSubmitting(false);

    if (error) {
      if (response.status === 409) {
        setErrorKind(error.error === "LastRoleManagerProtected" ? "lastRoleManager" : "conflict");
      } else {
        setErrorKind("generic");
      }
      return;
    }

    router.refresh();
  }

  return (
    <div>
      {errorKind ? (
        <Alert tone="danger" className="mb-3">
          {errorKind === "lastRoleManager"
            ? t("lastRoleManagerError")
            : errorKind === "conflict"
              ? t("statusConflictError")
              : t("genericError")}
        </Alert>
      ) : null}
      <Button
        variant={status === "ACTIVE" ? "secondary" : "primary"}
        onClick={handleClick}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <Spinner className="h-4 w-4" /> {t("working")}
          </>
        ) : status === "ACTIVE" ? (
          t("deactivate")
        ) : (
          t("activate")
        )}
      </Button>
    </div>
  );
}
