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

type CreateAccountErrorKind = "rateLimited" | "genericError";

// Mirrors login-form.tsx's shape closely (same Card/Stack/FormField
// pattern, same "no client-side schema validation beyond the input's own
// type/minLength" posture). POST /api/v1/auth/register is @Public() (no
// CSRF header needed, same as login) and is deliberately enumeration-safe:
// it always returns the same generic response whether or not the email
// already had an account, and never sets a session cookie — so this form
// never redirects on success, it just shows the same "check your email"
// state and sends the customer back to /login to sign in once verified.
export function CreateAccountForm() {
  const t = useTranslations("CreateAccount");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<CreateAccountErrorKind | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorKind(null);
    setIsSubmitting(true);

    try {
      const { error, response } = await api.POST("/api/v1/auth/register", {
        body: {
          email,
          password,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
        },
      });

      if (error) {
        setErrorKind(response.status === 429 ? "rateLimited" : "genericError");
        return;
      }

      setSucceeded(true);
    } catch {
      // A rejected fetch (offline, unreachable API) isn't the typed
      // {data,error} shape above — without this, isSubmitting never reset.
      setErrorKind("genericError");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (succeeded) {
    return (
      <div className="w-full max-w-sm">
        <Card className="p-8 text-center">
          <Heading level={2} className="mb-3">
            {t("successTitle")}
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
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t("firstNameLabel")}>
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                )}
              </FormField>
              <FormField label={t("lastNameLabel")}>
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                )}
              </FormField>
            </div>
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

        <Text size="sm" tone="muted" className="mt-6 text-center">
          <Link href="/login" className="underline underline-offset-4">
            {t("backToLogin")}
          </Link>
        </Text>
      </Card>
    </div>
  );
}
