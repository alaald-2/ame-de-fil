import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container, Heading, EmptyState } from "@ame-de-fil/ui";
import { requireSession } from "../../../../lib/dal";
import { getServerApiClient } from "../../../../lib/server-api";
import { Link } from "../../../../i18n/navigation";
import { AddressCard } from "../../../../components/address-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Account.Addresses");
  return { title: t("title") };
}

export default async function AccountAddressesPage() {
  await requireSession();
  const t = await getTranslations("Account.Addresses");

  const client = await getServerApiClient();
  const { data, error } = await client.GET("/api/v1/addresses");
  if (error || !data) throw new Error("Failed to load addresses");

  return (
    <Container className="py-16">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <Heading level={1}>{t("title")}</Heading>
        <Link
          href="/account/addresses/new"
          className="text-sm text-accent-600 underline-offset-4 hover:underline"
        >
          {t("addLink")}
        </Link>
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          className="mt-8"
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={
            <Link
              href="/account/addresses/new"
              className="text-sm text-accent-600 underline-offset-4 hover:underline"
            >
              {t("addLink")}
            </Link>
          }
        />
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {data.items.map((address) => (
            <AddressCard key={address.id} address={address} />
          ))}
        </div>
      )}
    </Container>
  );
}
