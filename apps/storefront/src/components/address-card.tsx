"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Card,
  Text,
  Badge,
  Button,
  Alert,
  Spinner,
  Dialog,
  DialogTrigger,
  DialogContent,
} from "@ame-de-fil/ui";
import type { AddressResponse } from "@ame-de-fil/types";
import { Link } from "../i18n/navigation";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";

// Delete confirmation mirrors apps/admin/src/components/delete-product-action.tsx's
// exact Dialog/DialogTrigger/DialogContent shape (danger-variant Button
// inside the dialog, DELETE with the CSRF header) — the one destructive
// action here, same posture as that file's own "the one irreversible
// action on this page" comment.
export function AddressCard({ address }: { address: AddressResponse }) {
  const t = useTranslations("Account.Addresses");
  const router = useRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSettingDefault, setIsSettingDefault] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function handleDelete() {
    setHasError(false);
    setIsDeleting(true);

    try {
      const { error } = await api.DELETE("/api/v1/addresses/{addressId}", {
        params: { path: { addressId: address.id } },
        headers: { "x-csrf-token": readCsrfCookie() },
      });

      if (error) {
        setHasError(true);
        return;
      }

      setIsDeleteOpen(false);
      router.refresh();
    } catch {
      // A rejected fetch (offline, unreachable API) isn't the typed
      // {data,error} shape above — without this, isDeleting never resets.
      setHasError(true);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleSetDefault() {
    setHasError(false);
    setIsSettingDefault(true);

    try {
      const { error } = await api.PATCH("/api/v1/addresses/{addressId}", {
        params: { path: { addressId: address.id } },
        headers: { "x-csrf-token": readCsrfCookie() },
        body: { isDefault: true },
      });

      if (error) {
        setHasError(true);
        return;
      }

      router.refresh();
    } catch {
      setHasError(true);
    } finally {
      setIsSettingDefault(false);
    }
  }

  return (
    <Card>
      {hasError ? (
        <Alert tone="danger" className="mb-4">
          {t("genericError")}
        </Alert>
      ) : null}

      <div className="flex items-start justify-between gap-4">
        <div>
          {address.label ? (
            <Text size="sm" tone="muted">
              {address.label}
            </Text>
          ) : null}
          <Text className="mt-1">{address.name}</Text>
          <Text tone="muted" className="mt-1">
            {address.line1}
            {address.line2 ? <>, {address.line2}</> : null}
            <br />
            {address.postalCode} {address.city}
            {address.phone ? (
              <>
                <br />
                {address.phone}
              </>
            ) : null}
          </Text>
        </div>
        {address.isDefault ? <Badge tone="success">{t("defaultBadge")}</Badge> : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href={{ pathname: "/account/addresses/[addressId]", params: { addressId: address.id } }}
          className="text-sm text-accent-600 underline-offset-4 hover:underline"
        >
          {t("edit")}
        </Link>
        {!address.isDefault ? (
          <Button
            type="button"
            variant="ghost"
            onClick={handleSetDefault}
            disabled={isSettingDefault}
          >
            {isSettingDefault ? <Spinner className="h-4 w-4" /> : null} {t("setAsDefaultAction")}
          </Button>
        ) : null}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="ghost">
              {t("delete")}
            </Button>
          </DialogTrigger>
          <DialogContent
            title={t("deleteConfirmTitle")}
            description={t("deleteConfirmDescription")}
            closeLabel={t("close")}
          >
            <div className="mt-6 flex justify-end gap-3">
              <Button type="button" variant="danger" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? <Spinner className="h-4 w-4" /> : null} {t("delete")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}
