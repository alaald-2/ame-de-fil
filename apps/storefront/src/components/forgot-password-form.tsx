"use client";

import { useState, type FormEvent } from "react";
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

// POST /api/v1/auth/forgot-password is @Public() and enumeration-safe —
// always the same generic response, so this form always ends in the same
// success state regardless of whether the email exists.
export function ForgotPasswordForm() {
  const t = useTranslations("ForgotPassword");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [isGenericError, setIsGenericError] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsRateLimited(false);
    setIsGenericError(false);
    setIsSubmitting(true);

    try {
      const { error, response } = await api.POST("/api/v1/auth/forgot-password", {
        body: { email },
      });

      if (error) {
        if (response.status === 429) setIsRateLimited(true);
        // Any other error (e.g. a malformed email) still resolves to the
        // same generic success state below — this endpoint is enumeration-
        // safe by design, and a validation failure carries no signal worth
        // surfacing differently.
        else setSucceeded(true);
        return;
      }

      setSucceeded(true);
    } catch {
      // Unlike the branch above, this means the request never reached the
      // API at all (offline, unreachable) — a real failure, not one of the
      // deliberately-indistinguishable enumeration-safe outcomes, so it
      // must NOT resolve to the same "check your email" success screen
      // (no email will ever be sent).
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
            {t("backToLogin")}
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <Card className="p-8">
        <Heading level={2} className="mb-3 text-center">
          {t("title")}
        </Heading>
        <Text tone="muted" className="mb-6 text-center">
          {t("intro")}
        </Text>

        {isRateLimited ? (
          <Alert tone="danger" className="mb-6">
            {t("rateLimited")}
          </Alert>
        ) : null}
        {isGenericError ? (
          <Alert tone="danger" className="mb-6">
            {t("genericError")}
          </Alert>
        ) : null}

        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <FormField label={t("emailLabel")} required>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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

        <Text size="sm" tone="muted" className="mt-6 text-center">
          <Link href="/login" className="underline underline-offset-4">
            {t("backToLogin")}
          </Link>
        </Text>
      </Card>
    </div>
  );
}
