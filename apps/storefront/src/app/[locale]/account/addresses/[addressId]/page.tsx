import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Container } from "@ame-de-fil/ui";
import { requireSession } from "../../../../../lib/dal";
import { getServerApiClient } from "../../../../../lib/server-api";
import { unwrapOrNotFound } from "../../../../../lib/fetch-or-not-found";
import { AddressForm } from "../../../../../components/address-form";

type PageParams = { addressId: string };

async function loadAddress(addressId: string) {
  const client = await getServerApiClient();
  const result = await client.GET("/api/v1/addresses/{addressId}", {
    params: { path: { addressId } },
  });
  return unwrapOrNotFound(result, "Failed to load address");
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Account.Addresses");
  return { title: t("editTitle") };
}

export default async function EditAddressPage({ params }: { params: Promise<PageParams> }) {
  await requireSession();
  const { addressId } = await params;
  const address = await loadAddress(addressId);
  if (!address) notFound();

  return (
    <Container className="py-16">
      <AddressForm address={address} />
    </Container>
  );
}
