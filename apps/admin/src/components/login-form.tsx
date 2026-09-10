"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Heading, Alert, FormField, Input, Button, Stack, Spinner } from "@ame-de-fil/ui";
import { api } from "../lib/api-client";

type LoginErrorKind = "invalidCredentials" | "genericError";

// Real login against POST /auth/login (DECISIONS.md ADR-032). The backend's
// own error message is never surfaced directly — it's English-only and not
// meant for end-user display — so failures are mapped by HTTP status to our
// own localized copy instead (401 -> invalidCredentials, anything else ->
// genericError). Success stores nothing client-side: the httpOnly
// ame_session cookie set by the response is the only source of truth, and
// router.refresh() forces the (dashboard) layout's own DAL call to
// re-evaluate it on the next render rather than navigating to a stale one.
export function LoginForm() {
  const t = useTranslations("Login");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<LoginErrorKind | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorKind(null);
    setIsSubmitting(true);

    const { error, response } = await api.POST("/api/v1/auth/login", {
      body: { email, password },
    });

    if (error) {
      setIsSubmitting(false);
      setErrorKind(response.status === 401 ? "invalidCredentials" : "genericError");
      return;
    }

    const destination = searchParams.get("from") || "/";
    router.push(destination);
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <Heading level={2} className="mb-6 text-center">
        {t("title")}
      </Heading>
      {errorKind ? (
        <Alert tone="danger" className="mb-6">
          {t(errorKind)}
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
          <FormField label={t("passwordLabel")} required>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </FormField>
          <Button type="submit" disabled={isSubmitting} className="mt-2">
            {isSubmitting ? (
              <>
                <Spinner className="h-4 w-4" /> {t("signingIn")}
              </>
            ) : (
              t("submit")
            )}
          </Button>
        </Stack>
      </form>
    </div>
  );
}
