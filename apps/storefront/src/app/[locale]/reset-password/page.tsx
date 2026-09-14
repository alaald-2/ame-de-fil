import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container, Spinner } from "@ame-de-fil/ui";
import { ResetPasswordForm } from "../../../components/reset-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ResetPassword");
  return { title: t("title") };
}

// ResetPasswordForm reads ?token= via useSearchParams, which requires a
// Suspense boundary so this route can still prerender its static shell
// (same reasoning as login/page.tsx).
export default function ResetPasswordPage() {
  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center py-16">
      <Suspense fallback={<Spinner />}>
        <ResetPasswordForm />
      </Suspense>
    </Container>
  );
}
