"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Container, Heading, Text, Button, Alert } from "@ame-de-fil/ui";

// Error boundaries are required to be Client Components in the App Router —
// the one genuinely necessary client boundary here, not a stylistic choice.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Errors");

  useEffect(() => {
    // Structured client-side error logging is a later observability concern
    // (DEPLOYMENT.md §5) — console.error is the honest placeholder for now.
    console.error(error);
  }, [error]);

  return (
    <Container className="py-24 text-center">
      <Heading level={1}>{t("genericTitle")}</Heading>
      <Text tone="muted" className="mx-auto mt-4 max-w-md">
        {t("genericBody")}
      </Text>
      {error.digest ? (
        <Alert tone="info" className="mx-auto mt-6 max-w-md text-left">
          <code>{error.digest}</code>
        </Alert>
      ) : null}
      <div className="mt-8">
        <Button onClick={reset}>{t("retry")}</Button>
      </div>
    </Container>
  );
}
