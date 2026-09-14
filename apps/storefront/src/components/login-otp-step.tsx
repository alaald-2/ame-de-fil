"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Text, Alert, Button, Spinner } from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { useCart } from "./cart-provider";
import { OtpCodeInput } from "./otp-code-input";

type OtpErrorKind = "invalidCode" | "rateLimited" | "genericError";

const RESEND_COOLDOWN_SECONDS = 60;

interface LoginOtpStepProps {
  email: string;
  destination: string;
  onChangeEmail: () => void;
}

// The code has already been sent by the time this step renders — either
// login-form.tsx's own email step (when /auth/login-method said "otp") or
// login-password-step.tsx's "email me a code instead" link triggered the
// POST /api/v1/auth/otp/request that put us here (both call sites live in
// login-form.tsx, which owns all three steps' shared email/step state).
export function LoginOtpStep({ email, destination, onChangeEmail }: LoginOtpStepProps) {
  const t = useTranslations("Login");
  const router = useRouter();
  const { refresh: refreshCart } = useCart();
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorKind, setErrorKind] = useState<OtpErrorKind | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => setCooldownSeconds((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  async function handleComplete(fullCode: string) {
    setErrorKind(null);
    setIsVerifying(true);

    try {
      const { error, response } = await api.POST("/api/v1/auth/otp/verify", {
        body: { email, code: fullCode },
      });

      if (error) {
        setCode(""); // reset the boxes, same low-drama treatment as Shopify's own code screen
        setErrorKind(response.status === 429 ? "rateLimited" : "invalidCode");
        return;
      }

      // See login-password-step.tsx's own resync — same reasoning applies to
      // this login path.
      void refreshCart();
      router.push(destination);
      router.refresh();
    } catch {
      // A rejected fetch isn't the typed {data,error} shape above — without
      // this, isVerifying never reset and the screen stayed stuck spinning.
      setCode("");
      setErrorKind("genericError");
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    setIsResending(true);
    setErrorKind(null);

    try {
      const { error, response } = await api.POST("/api/v1/auth/otp/request", { body: { email } });

      if (error) {
        setErrorKind(response.status === 429 ? "rateLimited" : "genericError");
        return;
      }
      setCooldownSeconds(RESEND_COOLDOWN_SECONDS);
    } catch {
      setErrorKind("genericError");
    } finally {
      setIsResending(false);
    }
  }

  return (
    <div>
      <Text size="sm" tone="muted" className="mb-6 text-center">
        {t("otpSentTo", { email })}{" "}
        <button type="button" onClick={onChangeEmail} className="text-neutral-900 underline underline-offset-4">
          {t("changeEmail")}
        </button>
      </Text>

      {errorKind ? (
        <Alert tone="danger" className="mb-6">
          {t(errorKind)}
        </Alert>
      ) : null}

      <OtpCodeInput
        value={code}
        onChange={setCode}
        onComplete={handleComplete}
        disabled={isVerifying}
        invalid={errorKind === "invalidCode"}
      />

      {isVerifying ? (
        <Text size="sm" tone="muted" className="mt-4 flex items-center justify-center gap-2">
          <Spinner className="h-4 w-4" /> {t("otpVerifying")}
        </Text>
      ) : null}

      <div className="mt-6 text-center">
        <Button variant="secondary" onClick={handleResend} disabled={isResending || cooldownSeconds > 0}>
          {isResending ? (
            <>
              <Spinner className="h-4 w-4" /> {t("otpSending")}
            </>
          ) : cooldownSeconds > 0 ? (
            t("otpResendIn", { seconds: cooldownSeconds })
          ) : (
            t("otpResend")
          )}
        </Button>
      </div>
    </div>
  );
}
