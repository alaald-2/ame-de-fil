import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container, Spinner } from "@ame-de-fil/ui";
import { VerifyEmailPanel } from "../../../components/verify-email-panel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("VerifyEmail");
  return { title: t("successTitle") };
}

export default function VerifyEmailPage() {
  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center py-16">
      <Suspense fallback={<Spinner />}>
        <VerifyEmailPanel />
      </Suspense>
    </Container>
  );
}
