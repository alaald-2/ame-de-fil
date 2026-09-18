"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  Alert,
  Dialog,
  DialogTrigger,
  DialogContent,
  FormField,
  Input,
  Textarea,
  Label,
  Spinner,
} from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";
import type { AssigneeOption } from "./task-row-actions";

const TASK_TYPES = [
  "GENERAL",
  "CUSTOMER_FOLLOW_UP",
  "RESTOCK",
  "INSPECT_RETURN",
  "START_PRODUCTION",
  "FINISH_PRODUCTION",
  "QUALITY_CHECK",
  "PACK_ORDER",
  "SHIP_ORDER",
  "FOLLOW_UP_DELAYED_ORDER",
  "FOLLOW_UP_PENDING_REFUND",
  "FOLLOW_UP_FAILED_REFUND",
  "REVIEW_DISPUTE",
] as const;

interface CreateTaskDialogProps {
  assignees: AssigneeOption[];
}

type ErrorKind = "generic" | null;

function assigneeLabel(option: AssigneeOption): string {
  const name = [option.firstName, option.lastName].filter(Boolean).join(" ");
  return name || option.email;
}

// Manual creation only — deliberately no order/orderItem/product/customer
// link fields here (the API accepts them, but linking a task to a specific
// record is what TaskAutomationService's own generated tasks are for; an
// admin creating one by hand from this general list is the "general manual
// task" / typed-but-unlinked case, PRODUCT_SPEC.md's original brief).
export function CreateTaskDialog({ assignees }: CreateTaskDialogProps) {
  const t = useTranslations("Tasks");
  const router = useRouter();
  const selectId = useId();
  const assigneeSelectId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<(typeof TASK_TYPES)[number]>("GENERAL");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);

  function reset() {
    setType("GENERAL");
    setTitle("");
    setNotes("");
    setDueDate("");
    setAssignedToUserId("");
    setErrorKind(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setErrorKind(null);
    setIsSubmitting(true);

    const { error } = await api.POST("/api/v1/admin/tasks", {
      headers: { "x-csrf-token": readCsrfCookie() },
      body: {
        type,
        title: title.trim(),
        notes: notes.trim() || undefined,
        // A bare <input type="date"> value has no time component — treated
        // as end-of-day local, which for a Sweden-only admin tool is close
        // enough to "due that day" without needing a time picker.
        dueAt: dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : undefined,
        assignedToUserId: assignedToUserId || undefined,
      },
    });

    setIsSubmitting(false);
    if (error) {
      setErrorKind("generic");
      return;
    }
    setIsOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>{t("createTask")}</Button>
      </DialogTrigger>
      <DialogContent
        title={t("createDialogTitle")}
        description={t("createDialogDescription")}
        closeLabel={t("close")}
      >
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            {errorKind ? <Alert tone="danger">{t("createGenericError")}</Alert> : null}

            <FormField label={t("typeLabel")}>
              {(fieldProps) => (
                <select
                  {...fieldProps}
                  id={selectId}
                  value={type}
                  onChange={(e) => setType(e.target.value as (typeof TASK_TYPES)[number])}
                  className="rounded-sm border border-neutral-300 bg-neutral-50 px-3 py-2 font-sans text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                >
                  {TASK_TYPES.map((option) => (
                    <option key={option} value={option}>
                      {t(`type.${option}`)}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField label={t("titleLabel")} required>
              {(fieldProps) => (
                <Input {...fieldProps} value={title} onChange={(e) => setTitle(e.target.value)} />
              )}
            </FormField>

            <FormField label={t("notesLabel")}>
              {(fieldProps) => (
                <Textarea
                  {...fieldProps}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              )}
            </FormField>

            <FormField label={t("dueDateLabel")}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              )}
            </FormField>

            <div>
              <Label htmlFor={assigneeSelectId}>{t("assigneeLabel")}</Label>
              <select
                id={assigneeSelectId}
                value={assignedToUserId}
                onChange={(e) => setAssignedToUserId(e.target.value)}
                className="mt-1.5 w-full rounded-sm border border-neutral-300 bg-neutral-50 px-3 py-2 font-sans text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              >
                <option value="">{t("unassigned")}</option>
                {assignees.map((option) => (
                  <option key={option.id} value={option.id}>
                    {assigneeLabel(option)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button type="submit" disabled={isSubmitting || !title.trim()}>
              {isSubmitting ? (
                <>
                  <Spinner className="h-4 w-4" /> {t("createTask")}
                </>
              ) : (
                t("createTask")
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
