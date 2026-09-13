"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Heading, Text, Alert, Card, FormField, Input, Button, Stack, Spinner } from "@ame-de-fil/ui";
import { api } from "../lib/api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

type LoginErrorKind = "invalidCredentials" | "genericError";

// Real login against POST /auth/login (same backend as apps/admin's own
// LoginForm — DECISIONS.md ADR-032). There is deliberately no password
// *registration* form here: AuthController's own comment is explicit that
// self-service password sign-up doesn't exist yet (tracked separately) —
// "Continue with Google" (ADR-033) is the only real way a new customer
// gets an account today, which is why it's the prominent option, not an
// afterthought below the form. A plain anchor, not a client-side call: the
// whole point is a full top-level navigation through Google's own consent
// screen and back.
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

    const destination = searchParams.get("from") || "/account";
    router.push(destination);
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <Card className="p-8">
        <Heading level={2} className="mb-6 text-center">
          {t("title")}
        </Heading>

        <a
          href={`${API_URL}/api/v1/auth/google`}
          className="flex w-full items-center justify-center gap-2 rounded-sm border border-neutral-300 px-5 py-2.5 font-sans text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        >
          {t("continueWithGoogle")}
        </a>
        <Text size="sm" tone="muted" className="mt-3 text-center">
          {t("googleHint")}
        </Text>

        <div className="my-6 flex items-center gap-3" aria-hidden="true">
          <div className="h-px flex-1 bg-neutral-200" />
          <Text size="sm" tone="muted">
            {t("orDivider")}
          </Text>
          <div className="h-px flex-1 bg-neutral-200" />
        </div>

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
            <Button type="submit" variant="secondary" disabled={isSubmitting} className="mt-2">
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
      </Card>
    </div>
  );
}
