import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container } from "@ame-de-fil/ui";
import { requireSession } from "../../../../../lib/dal";
import { AddressForm } from "../../../../../components/address-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Account.Addresses");
  return { title: t("addTitle") };
}

export default async function NewAddressPage() {
  await requireSession();

  return (
    <Container className="py-16">
      <AddressForm />
    </Container>
  );
}
