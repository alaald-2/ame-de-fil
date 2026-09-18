"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Alert, Spinner, Label, VisuallyHidden } from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";

export interface AssigneeOption {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

interface TaskRowActionsProps {
  taskId: string;
  status: "OPEN" | "DONE" | "CANCELED";
  assignedToUserId: string | null;
  assignees: AssigneeOption[];
}

type ErrorKind = "conflict" | "generic" | null;

const UNASSIGNED_VALUE = "";

function assigneeLabel(option: AssigneeOption): string {
  const name = [option.firstName, option.lastName].filter(Boolean).join(" ");
  return name || option.email;
}

// One assignee select plus exactly one status action per row — OPEN gets
// Complete/Cancel, DONE/CANCELED get Reopen — same "one control per current
// state" posture as order-fulfillment-actions.tsx/product-status-action.tsx.
// Visible regardless of whether the caller actually holds tasks.manage
// (today's single seeded "admin" role holds every permission — seed.ts);
// a caller without it simply gets a 403 from the guard, surfaced as the
// generic error below.
export function TaskRowActions({
  taskId,
  status,
  assignedToUserId,
  assignees,
}: TaskRowActionsProps) {
  const t = useTranslations("Tasks");
  const router = useRouter();
  const selectId = useId();
  const [isAssigning, setIsAssigning] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);

  async function handleAssignChange(value: string) {
    setErrorKind(null);
    setIsAssigning(true);
    const { error } = await api.POST("/api/v1/admin/tasks/{id}/assign", {
      params: { path: { id: taskId } },
      headers: { "x-csrf-token": readCsrfCookie() },
      body: { assignedToUserId: value === UNASSIGNED_VALUE ? null : value },
    });
    setIsAssigning(false);
    if (error) {
      setErrorKind("generic");
      return;
    }
    router.refresh();
  }

  // Three branches, not one dynamic path variable, so the generated client
  // can infer each endpoint's exact literal type — same posture as
  // create-taxonomy-dialog.tsx's own categories/collections split.
  async function handleTransition(action: "complete" | "reopen" | "cancel") {
    setErrorKind(null);
    setIsTransitioning(true);
    const { error, response } =
      action === "complete"
        ? await api.POST("/api/v1/admin/tasks/{id}/complete", {
            params: { path: { id: taskId } },
            headers: { "x-csrf-token": readCsrfCookie() },
          })
        : action === "reopen"
          ? await api.POST("/api/v1/admin/tasks/{id}/reopen", {
              params: { path: { id: taskId } },
              headers: { "x-csrf-token": readCsrfCookie() },
            })
          : await api.POST("/api/v1/admin/tasks/{id}/cancel", {
              params: { path: { id: taskId } },
              headers: { "x-csrf-token": readCsrfCookie() },
            });
    setIsTransitioning(false);
    if (error) {
      setErrorKind(response.status === 409 ? "conflict" : "generic");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {errorKind ? (
        <Alert tone="danger" className="sm:hidden">
          {errorKind === "conflict" ? t("actionConflictError") : t("actionGenericError")}
        </Alert>
      ) : null}

      <Label htmlFor={selectId}>
        <VisuallyHidden>{t("assigneeLabel")}</VisuallyHidden>
      </Label>
      <select
        id={selectId}
        value={assignedToUserId ?? UNASSIGNED_VALUE}
        onChange={(e) => handleAssignChange(e.target.value)}
        disabled={isAssigning}
        className="rounded-sm border border-neutral-300 bg-neutral-50 px-2 py-1.5 font-sans text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        <option value={UNASSIGNED_VALUE}>{t("unassigned")}</option>
        {assignees.map((option) => (
          <option key={option.id} value={option.id}>
            {assigneeLabel(option)}
          </option>
        ))}
      </select>

      {status === "OPEN" ? (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleTransition("complete")}
            disabled={isTransitioning}
          >
            {isTransitioning ? <Spinner className="h-4 w-4" /> : null}
            {t("complete")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleTransition("cancel")}
            disabled={isTransitioning}
          >
            {t("cancel")}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          onClick={() => handleTransition("reopen")}
          disabled={isTransitioning}
        >
          {isTransitioning ? <Spinner className="h-4 w-4" /> : null}
          {t("reopen")}
        </Button>
      )}

      {errorKind ? (
        <Alert tone="danger" className="hidden sm:block">
          {errorKind === "conflict" ? t("actionConflictError") : t("actionGenericError")}
        </Alert>
      ) : null}
    </div>
  );
}
