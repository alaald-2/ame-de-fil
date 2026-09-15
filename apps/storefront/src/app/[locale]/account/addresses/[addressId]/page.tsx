import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Container } from "@ame-de-fil/ui";
import { requireSession } from "../../../../../lib/dal";
import { getServerApiClient } from "../../../../../lib/server-api";
import { AddressForm } from "../../../../../components/address-form";

type PageParams = { addressId: string };

// Same loadOrder/response.status === 404 pattern as the Orders detail page
// (app/[locale]/account/orders/[orderId]/page.tsx) — ownership-scoped 404
// from the API becomes Next's own notFound() here.
async function loadAddress(addressId: string) {
  const client = await getServerApiClient();
  const { data, error, response } = await client.GET("/api/v1/addresses/{addressId}", {
    params: { path: { addressId } },
  });
  if (response.status === 404) return null;
  if (error || !data) throw new Error("Failed to load address");
  return data;
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
