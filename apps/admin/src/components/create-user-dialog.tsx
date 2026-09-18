"use client";

import { useState, type FormEvent } from "react";
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
  Spinner,
  Label,
} from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";

export interface AssignableRole {
  id: string;
  name: string;
}

interface CreateUserDialogProps {
  // Only roles whose permissions are a subset of the acting admin's own
  // (checked here purely for UX — the backend re-checks independently via
  // permissionsAreSubsetOfActor and is the real boundary) are ever offered.
  // Always non-empty — the page only renders this dialog's trigger at all
  // when at least one role is assignable (see administration/page.tsx's own
  // comment: a user created with zero roles would be permanently invisible
  // to both GET /admin/users and GET /admin/users/:id, which are staff-
  // scoped by design).
  assignableRoles: AssignableRole[];
}

type CreateErrorKind =
  "emailExists" | "exceedsOwnGrant" | "roleNotFound" | "rateLimited" | "generic" | null;

// Password is always server-generated (approved design, admin-users.service.ts)
// and returned exactly once in this response — never persisted or logged
// in plaintext, and never retrievable again afterward. The dialog stays
// open on success (unlike RefundDialog, which closes immediately) so the
// admin has a chance to actually copy it before dismissing.
export function CreateUserDialog({ assignableRoles }: CreateUserDialogProps) {
  const t = useTranslations("Administration.createUser");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<CreateErrorKind>(null);
  const [created, setCreated] = useState<{ email: string; generatedPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setEmail("");
    setFirstName("");
    setLastName("");
    setSelectedRoleIds([]);
    setErrorKind(null);
    setCreated(null);
    setCopied(false);
  }

  function toggleRole(roleId: string) {
    setSelectedRoleIds((current) =>
      current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId],
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (selectedRoleIds.length === 0) return; // belt-and-suspenders — submit is disabled without one
    setErrorKind(null);
    setIsSubmitting(true);

    const { data, error, response } = await api.POST("/api/v1/admin/users", {
      headers: { "x-csrf-token": readCsrfCookie() },
      body: {
        email,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        initialRoleIds: selectedRoleIds,
      },
    });

    setIsSubmitting(false);

    if (error) {
      if (response.status === 409) setErrorKind("emailExists");
      else if (response.status === 403) setErrorKind("exceedsOwnGrant");
      else if (response.status === 404) setErrorKind("roleNotFound");
      else if (response.status === 429) setErrorKind("rateLimited");
      else setErrorKind("generic");
      return;
    }

    setCreated({ email: data.email, generatedPassword: data.generatedPassword });
  }

  async function handleCopy() {
    if (!created) return;
    await navigator.clipboard.writeText(created.generatedPassword);
    setCopied(true);
  }

  function handleDone() {
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
        <Button>{t("action")}</Button>
      </DialogTrigger>
      <DialogContent
        title={t("dialogTitle")}
        description={t("dialogDescription")}
        closeLabel={t("close")}
      >
        {created ? (
          <div className="flex flex-col gap-4">
            <Alert tone="success">{t("createdMessage", { email: created.email })}</Alert>
            <div>
              <Label>{t("generatedPasswordLabel")}</Label>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="flex-1 truncate rounded-sm border border-neutral-300 bg-neutral-50 px-3 py-2 font-mono text-sm text-neutral-900">
                  {created.generatedPassword}
                </code>
                <Button type="button" variant="secondary" onClick={handleCopy}>
                  {copied ? t("copied") : t("copy")}
                </Button>
              </div>
              <p className="mt-1.5 text-sm text-neutral-600">{t("passwordWarning")}</p>
            </div>
            <div className="mt-2 flex justify-end">
              <Button type="button" onClick={handleDone}>
                {t("done")}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-4">
              {errorKind ? (
                <Alert tone="danger">
                  {errorKind === "emailExists"
                    ? t("emailExistsError")
                    : errorKind === "exceedsOwnGrant"
                      ? t("exceedsOwnGrantError")
                      : errorKind === "roleNotFound"
                        ? t("roleNotFoundError")
                        : errorKind === "rateLimited"
                          ? t("rateLimitedError")
                          : t("genericError")}
                </Alert>
              ) : null}
              <FormField label={t("emailLabel")} required>
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    type="email"
                    required
                    placeholder={t("emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
              </FormField>
              <FormField label={t("firstNameLabel")}>
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    placeholder={t("firstNamePlaceholder")}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                )}
              </FormField>
              <FormField label={t("lastNameLabel")}>
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    placeholder={t("lastNamePlaceholder")}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                )}
              </FormField>
              <fieldset>
                <legend className="font-sans text-sm font-medium text-neutral-800">
                  {t("initialRolesLabel")}
                  <span aria-hidden="true" className="text-danger">
                    {" "}
                    *
                  </span>
                </legend>
                <div className="mt-1.5 flex flex-col gap-2">
                  {assignableRoles.map((role) => (
                    <label
                      key={role.id}
                      className="flex items-center gap-2 text-sm text-neutral-800"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded-sm border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                        checked={selectedRoleIds.includes(role.id)}
                        onChange={() => toggleRole(role.id)}
                      />
                      {role.name}
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-sm text-neutral-600">{t("initialRolesHint")}</p>
              </fieldset>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button type="submit" disabled={isSubmitting || selectedRoleIds.length === 0}>
                {isSubmitting ? (
                  <>
                    <Spinner className="h-4 w-4" /> {t("submit")}
                  </>
                ) : (
                  t("submit")
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
