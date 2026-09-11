"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Alert, Badge, Text, Spinner, Label, VisuallyHidden } from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";

export interface RoleSummary {
  id: string;
  name: string;
}

interface UserRoleManagerProps {
  userId: string;
  currentRoles: RoleSummary[];
  // Same "actor's own permissions is the ceiling" filtering as
  // CreateUserDialog's own assignableRoles prop — already excludes roles
  // the target holds (this component further excludes roles awaiting
  // removal locally between refreshes is unnecessary since a refresh
  // always follows a successful mutation).
  assignableRoles: RoleSummary[];
}

type ErrorKind =
  | "roleAlreadyAssigned"
  | "roleNotAssigned"
  | "lastRoleManager"
  | "exceedsOwnGrant"
  | "generic"
  | null;

// Self-role-changes are blocked completely server-side (isSelfTarget) — the
// detail page never renders this at all for the signed-in admin's own user,
// so there's no "why is this disabled" state to design for here.
export function UserRoleManager({ userId, currentRoles, assignableRoles }: UserRoleManagerProps) {
  const t = useTranslations("Administration.detail");
  const router = useRouter();
  const selectId = useId();
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState(assignableRoles[0]?.id ?? "");
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);

  async function handleAssign() {
    if (!selectedRoleId) return;
    setErrorKind(null);
    setPendingRoleId(selectedRoleId);

    const { error, response } = await api.POST("/api/v1/admin/users/{id}/roles", {
      params: { path: { id: userId } },
      headers: { "x-csrf-token": readCsrfCookie() },
      body: { roleId: selectedRoleId },
    });

    setPendingRoleId(null);

    if (error) {
      if (response.status === 409) setErrorKind("roleAlreadyAssigned");
      else if (response.status === 403) setErrorKind("exceedsOwnGrant");
      else setErrorKind("generic");
      return;
    }

    router.refresh();
  }

  async function handleRemove(roleId: string) {
    setErrorKind(null);
    setPendingRoleId(roleId);

    const { error, response } = await api.DELETE("/api/v1/admin/users/{id}/roles/{roleId}", {
      params: { path: { id: userId, roleId } },
      headers: { "x-csrf-token": readCsrfCookie() },
    });

    setPendingRoleId(null);

    if (error) {
      if (response.status === 409) {
        setErrorKind(error.error === "LastRoleManagerProtected" ? "lastRoleManager" : "roleNotAssigned");
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
          {errorKind === "roleAlreadyAssigned"
            ? t("roleAlreadyAssignedError")
            : errorKind === "roleNotAssigned"
              ? t("roleNotAssignedError")
              : errorKind === "lastRoleManager"
                ? t("lastRoleManagerError")
                : errorKind === "exceedsOwnGrant"
                  ? t("exceedsOwnGrantError")
                  : t("genericError")}
        </Alert>
      ) : null}

      {currentRoles.length === 0 ? (
        <Text size="sm" className="text-neutral-600">
          {t("noRoles")}
        </Text>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2">
            {currentRoles.map((role) => {
              // GET /admin/users and GET /admin/users/:id are both
              // staff-scoped (roles: { some: {} }) — removing a user's
              // last remaining role here would make this very detail page
              // 404 on its next refresh, and the user would then be
              // unreachable through this UI forever (no search-by-email,
              // no way to recover an id not written down elsewhere). The
              // backend has no such protection (it only guards the last
              // holder of users.manage_roles specifically, not "having any
              // role at all"), so this has to be a client-side guard.
              const isOnlyRole = currentRoles.length === 1;
              return (
                <li key={role.id}>
                  <Badge className="gap-1.5 pr-1">
                    {role.name}
                    <button
                      type="button"
                      onClick={() => handleRemove(role.id)}
                      disabled={isOnlyRole || pendingRoleId === role.id}
                      aria-label={t("removeRole", { role: role.name })}
                      title={isOnlyRole ? t("cannotRemoveLastRole") : undefined}
                      className="rounded-sm px-1 text-neutral-500 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-50 disabled:hover:text-neutral-500"
                    >
                      &times;
                    </button>
                  </Badge>
                </li>
              );
            })}
          </ul>
          {currentRoles.length === 1 ? (
            <Text size="sm" className="mt-1.5 text-neutral-600">
              {t("cannotRemoveLastRole")}
            </Text>
          ) : null}
        </>
      )}

      {assignableRoles.length > 0 ? (
        <div className="mt-4 flex items-center gap-2">
          <Label htmlFor={selectId}>
            <VisuallyHidden>{t("roleToAssignLabel")}</VisuallyHidden>
          </Label>
          <select
            id={selectId}
            value={selectedRoleId}
            onChange={(e) => setSelectedRoleId(e.target.value)}
            className="rounded-sm border border-neutral-300 bg-neutral-50 px-3 py-2 font-sans text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            {assignableRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          <Button type="button" variant="secondary" onClick={handleAssign} disabled={pendingRoleId !== null}>
            {pendingRoleId === selectedRoleId ? <Spinner className="h-4 w-4" /> : null}
            {t("assignRole")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
