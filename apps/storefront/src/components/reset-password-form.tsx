"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Heading,
  Text,
  Alert,
  Card,
  FormField,
  Input,
  Button,
  Stack,
  Spinner,
} from "@ame-de-fil/ui";
import { Link } from "../i18n/navigation";
import { api } from "../lib/api-client";

// Reached via the emailed reset link's storefront page — the link itself
// points here with ?token=..., and this component's own submit fires the
// actual POST /api/v1/auth/reset-password (a POST, not a GET, so a link
// merely being opened — e.g. by an email security scanner — can never burn
// the single-use token on its own; see AuthController's own comment on
// this same reasoning for /auth/verify-email).
export function ResetPasswordForm() {
  const t = useTranslations("ResetPassword");
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInvalidToken, setIsInvalidToken] = useState(false);
  const [isGenericError, setIsGenericError] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setIsInvalidToken(false);
    setIsGenericError(false);
    setIsSubmitting(true);

    try {
      const { error, response } = await api.POST("/api/v1/auth/reset-password", {
        body: { token, password },
      });

      if (error) {
        if (response.status === 400) setIsInvalidToken(true);
        else setIsGenericError(true);
        return;
      }

      setSucceeded(true);
    } catch {
      // A rejected fetch (offline, unreachable API) isn't the typed
      // {data,error} shape above — without this, isSubmitting never reset.
      setIsGenericError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (succeeded) {
    return (
      <div className="w-full max-w-sm">
        <Card className="p-8 text-center">
          <Heading level={2} className="mb-3">
            {t("title")}
          </Heading>
          <Text tone="muted">{t("successMessage")}</Text>
          <Link
            href="/login"
            className="mt-6 inline-block font-sans text-sm font-medium text-neutral-900 underline underline-offset-4"
          >
            {t("goToLogin")}
          </Link>
        </Card>
      </div>
    );
  }

  if (!token || isInvalidToken) {
    return (
      <div className="w-full max-w-sm">
        <Card className="p-8 text-center">
          <Heading level={2} className="mb-3">
            {t("invalidTitle")}
          </Heading>
          <Text tone="muted">{t("invalidMessage")}</Text>
          <Link
            href="/forgot-password"
            className="mt-6 inline-block font-sans text-sm font-medium text-neutral-900 underline underline-offset-4"
          >
            {t("requestNewLink")}
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <Card className="p-8">
        <Heading level={2} className="mb-6 text-center">
          {t("title")}
        </Heading>

        {isGenericError ? (
          <Alert tone="danger" className="mb-6">
            {t("genericError")}
          </Alert>
        ) : null}

        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <FormField label={t("passwordLabel")} required hint={t("passwordHint")}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </FormField>
            <Button type="submit" variant="secondary" disabled={isSubmitting} className="mt-2">
              {isSubmitting ? (
                <>
                  <Spinner className="h-4 w-4" /> {t("submitting")}
                </>
              ) : (
                t("submit")
              )}
            </Button>
          </Stack>
        </form>
      </Card>
    </div>
  );
}
