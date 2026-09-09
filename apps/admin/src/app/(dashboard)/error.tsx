"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Heading, Text, Button, Alert } from "@ame-de-fil/ui";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Errors");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="py-16 text-center">
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
    </div>
  );
}
