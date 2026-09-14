import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container } from "@ame-de-fil/ui";
import { ForgotPasswordForm } from "../../../components/forgot-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ForgotPassword");
  return { title: t("title") };
}

export default function ForgotPasswordPage() {
  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center py-16">
      <ForgotPasswordForm />
    </Container>
  );
}
