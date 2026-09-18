"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Text, Alert, FormField, Input, Button, Stack, Spinner } from "@ame-de-fil/ui";
import { Link } from "../i18n/navigation";
import { api } from "../lib/api-client";
import { useCart } from "./cart-provider";

type PasswordErrorKind = "invalidCredentials" | "genericError";

interface LoginPasswordStepProps {
  email: string;
  destination: string;
  onChangeEmail: () => void;
  onUseOtpInstead: () => void;
}

// The second screen of the email-first flow, shown when /auth/login-method
// says this email has a password (login-form.tsx). No "unverified —
// resend?" state here: an unverified password account still logs in
// successfully (only checkout is gated on verification — apps/api's
// EmailVerifiedGuard), so this form never produces an unverified-specific
// error to react to.
export function LoginPasswordStep({
  email,
  destination,
  onChangeEmail,
  onUseOtpInstead,
}: LoginPasswordStepProps) {
  const t = useTranslations("Login");
  const router = useRouter();
  const { refresh: refreshCart } = useCart();
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<PasswordErrorKind | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorKind(null);
    setIsSubmitting(true);

    try {
      const { error, response } = await api.POST("/api/v1/auth/login", {
        body: { email, password },
      });

      if (error) {
        setErrorKind(response.status === 401 ? "invalidCredentials" : "genericError");
        return;
      }

      // Resync the guest-session cart the moment the account cart takes over
      // (e.g. a server-side guest-cart merge on login) — see the sign-out
      // button's own resync for the symmetric case and why router.refresh()
      // alone can't do this.
      void refreshCart();
      router.push(destination);
      router.refresh();
    } catch {
      // A rejected fetch (offline, unreachable API) isn't the typed
      // {data,error} shape above — without this, isSubmitting never reset
      // and the button stayed disabled/spinning forever with no error.
      setErrorKind("genericError");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <Text size="sm" tone="muted" className="mb-6 text-center">
        {email}{" "}
        <button
          type="button"
          onClick={onChangeEmail}
          className="text-neutral-900 underline underline-offset-4"
        >
          {t("changeEmail")}
        </button>
      </Text>

      {errorKind ? (
        <Alert tone="danger" className="mb-6">
          {t(errorKind)}
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <FormField label={t("passwordLabel")} required>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </FormField>
          <Text size="sm" className="-mt-2 text-right">
            <Link href="/forgot-password" className="text-neutral-600 underline underline-offset-4">
              {t("forgotPasswordLink")}
            </Link>
          </Text>
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

      <Text size="sm" tone="muted" className="mt-6 text-center">
        <button type="button" onClick={onUseOtpInstead} className="underline underline-offset-4">
          {t("useOtpInstead")}
        </button>
      </Text>
    </div>
  );
}
