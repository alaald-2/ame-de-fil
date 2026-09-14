import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container } from "@ame-de-fil/ui";
import { CreateAccountForm } from "../../../components/create-account-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CreateAccount");
  return { title: t("title") };
}

export default function CreateAccountPage() {
  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center py-16">
      <CreateAccountForm />
    </Container>
  );
}
