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
import { API_URL } from "../lib/env";
import { LoginPasswordStep } from "./login-password-step";
import { LoginOtpStep } from "./login-otp-step";

type Step = "email" | "password" | "otp";
type EmailStepErrorKind = "rateLimited" | "genericError";

// Email-first, progressive-disclosure login (DECISIONS.md ADR-036) — the
// interaction pattern is the one deliberate thing borrowed from Shopify's
// Customer Accounts flow; the visual identity (serif heading, cream Card,
// bordered fields, no gradients/shadows) stays entirely Âme de Fil's own.
// This component owns the shared `email`/`step` state across all three
// screens; the password and OTP screens are separate files since each has
// its own real form state (password / code) that doesn't need to leak back
// up here. "Continue with Google" only ever appears on the first (email)
// screen — once a customer has committed to email-based login, the
// password/OTP screens stay focused on that one path.
export function LoginForm() {
  const t = useTranslations("Login");
  const searchParams = useSearchParams();
  const destination = searchParams.get("from") || "/account";

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<EmailStepErrorKind | null>(null);

  // Wrapped in try/catch (here and in handleEmailSubmit below) since a
  // rejected fetch — offline, DNS failure, the API unreachable — isn't the
  // typed `{data,error}` shape openapi-fetch gives an HTTP-level failure;
  // it throws instead. Previously nothing caught that, so `isSubmitting`
  // (set true right before the call) was never reset — the button stayed
  // disabled/spinning forever with no error shown, and a page reload,
  // discarding whatever the user had typed, was the only way out.
  async function requestOtpAndAdvance(targetEmail: string) {
    try {
      // Enumeration-safe on the API side regardless of outcome — this
      // call's own error handling only ever needs to catch the rate-limit
      // case, the success/no-op cases are indistinguishable by design
      // (AuthService.requestLoginOtp) and both correctly land on the same
      // code screen.
      const { error, response } = await api.POST("/api/v1/auth/otp/request", {
        body: { email: targetEmail },
      });
      if (error && response.status === 429) {
        setErrorKind("rateLimited");
        return;
      }
      setStep("otp");
    } catch {
      setErrorKind("genericError");
    }
  }

  async function handleEmailSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorKind(null);
    setIsSubmitting(true);

    try {
      const { data, error, response } = await api.POST("/api/v1/auth/login-method", {
        body: { email },
      });

      if (error) {
        setErrorKind(response.status === 429 ? "rateLimited" : "genericError");
        return;
      }

      if (data.method === "password") {
        setStep("password");
        return;
      }

      await requestOtpAndAdvance(email);
    } catch {
      setErrorKind("genericError");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleChangeEmail() {
    setStep("email");
    setErrorKind(null);
  }

  async function handleUseOtpInstead() {
    await requestOtpAndAdvance(email);
  }

  return (
    <div className="w-full max-w-sm">
      <Card className="p-8">
        <Heading level={2} className="mb-6 text-center">
          {t("title")}
        </Heading>

        {step === "email" ? (
          <>
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

            <form onSubmit={handleEmailSubmit}>
              <Stack gap="md">
                <FormField label={t("emailLabel")} required>
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      type="email"
                      autoComplete="username"
                      autoFocus
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  )}
                </FormField>
                <Button type="submit" variant="secondary" disabled={isSubmitting} className="mt-2">
                  {isSubmitting ? (
                    <>
                      <Spinner className="h-4 w-4" /> {t("continuing")}
                    </>
                  ) : (
                    t("continueButton")
                  )}
                </Button>
              </Stack>
            </form>

            <Text size="sm" tone="muted" className="mt-6 text-center">
              {t("createAccountPrompt")}{" "}
              <Link
                href="/create-account"
                className="text-neutral-900 underline underline-offset-4"
              >
                {t("createAccountLink")}
              </Link>
            </Text>
          </>
        ) : null}

        {step === "password" ? (
          <LoginPasswordStep
            email={email}
            destination={destination}
            onChangeEmail={handleChangeEmail}
            onUseOtpInstead={handleUseOtpInstead}
          />
        ) : null}

        {step === "otp" ? (
          <LoginOtpStep email={email} destination={destination} onChangeEmail={handleChangeEmail} />
        ) : null}
      </Card>
    </div>
  );
}
