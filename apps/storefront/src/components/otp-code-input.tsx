"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@ame-de-fil/ui";

const DIGIT_COUNT = 6;

interface OtpCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}

// Six individual boxes over one real accessible value (not one hidden input
// behind decorative boxes) — each carries autocomplete="one-time-code" and
// inputMode="numeric" (helps platforms that scan Mail, not just SMS, for a
// code — Safari/iOS does this) and its own aria-label, so a screen reader
// announces "Digit 1 of 6" rather than nothing. Auto-advances focus on
// entry, auto-retreats on backspace into an empty box, and a paste of a
// full 6-digit code anywhere in the group fills every box at once — the
// common case when a code is copied whole from the email.
export function OtpCodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
}: OtpCodeInputProps) {
  const t = useTranslations("Login");
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: DIGIT_COUNT }, (_, i) => value[i] ?? "");

  function setDigit(index: number, digit: string) {
    const next = digits.slice();
    next[index] = digit;
    const nextValue = next.join("");
    onChange(nextValue);
    if (nextValue.length === DIGIT_COUNT && !nextValue.includes(" ")) {
      onComplete(nextValue);
    }
  }

  function handleChange(index: number, rawInput: string) {
    const onlyDigits = rawInput.replace(/\D/g, "");
    if (!onlyDigits) {
      setDigit(index, "");
      return;
    }
    // Handles a fast typist whose keystroke lands while the previous
    // character is still selected, producing more than one digit at once —
    // take the last one, matching how a native single-box OTP field would.
    const digit = onlyDigits.at(-1)!;
    setDigit(index, digit);
    if (index < DIGIT_COUNT - 1) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    event.preventDefault();

    const next = digits.slice();
    for (let i = 0; i < pasted.length && index + i < DIGIT_COUNT; i++) {
      next[index + i] = pasted[i]!;
    }
    const nextValue = next.join("");
    onChange(nextValue);

    const lastFilledIndex = Math.min(index + pasted.length, DIGIT_COUNT) - 1;
    inputRefs.current[Math.max(lastFilledIndex, 0)]?.focus();
    if (nextValue.length === DIGIT_COUNT && !nextValue.includes(" ")) {
      onComplete(nextValue);
    }
  }

  return (
    <div className="flex justify-center gap-2" role="group" aria-label={t("otpGroupLabel")}>
      {digits.map((digit, index) => (
        <Input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label={t("otpDigitLabel", { index: index + 1, count: DIGIT_COUNT })}
          aria-invalid={invalid || undefined}
          maxLength={1}
          autoFocus={index === 0}
          disabled={disabled}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={(e) => handlePaste(index, e)}
          className="h-14 w-11 text-center text-xl"
        />
      ))}
    </div>
  );
}
