import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container, Heading, Text, Alert } from "@ame-de-fil/ui";
import { requireSession } from "../../../lib/dal";
import { getServerApiClient } from "../../../lib/server-api";
import { Link } from "../../../i18n/navigation";
import { SignOutButton } from "../../../components/sign-out-button";
import { ResendVerificationButton } from "../../../components/resend-verification-button";
import { OrderSummaryRow } from "../../../components/order-summary-row";
import type { AppLocale } from "../../../lib/locale";

const RECENT_ORDERS_COUNT = 3;

function formatAddressLine(address: { line1: string; postalCode: string; city: string }): string {
  return `${address.line1}, ${address.postalCode} ${address.city}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Account");
  return { title: t("title") };
}

// The account hub — a set of light sections (Profile, Login & Security,
// Orders, Addresses), each growing its own nested route once it has real
// content (design discussion, docs/plans) rather than one flat page. No
// placeholder sections for Wishlist/Reviews/Preferences etc. — those get a
// card here only once they're real.
export default async function AccountPage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const t = await getTranslations("Account");
  const tOrders = await getTranslations("Account.Orders");
  const tAddresses = await getTranslations("Account.Addresses");
  const { user } = await requireSession();
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  const client = await getServerApiClient();
  const [{ data: orders }, { data: addresses }] = await Promise.all([
    client.GET("/api/v1/orders", { params: { query: { page: 1, pageSize: RECENT_ORDERS_COUNT } } }),
    client.GET("/api/v1/addresses"),
  ]);
  const defaultAddress = addresses?.items.find((address) => address.isDefault);

  return (
    <Container className="py-16">
      <Heading level={1}>{t("title")}</Heading>

      <section className="mt-10 max-w-sm">
        <Heading level={2}>{t("profileHeading")}</Heading>
        <Text size="lg" className="mt-3 text-neutral-900">
          {displayName}
        </Text>
        <Text tone="muted" className="mt-1">
          {user.email}
        </Text>
      </section>

      <section className="mt-10 max-w-sm">
        <Heading level={2}>{t("securityHeading")}</Heading>
        {!user.emailVerifiedAt ? (
          <Alert tone="info" className="mt-3">
            <Text size="sm">{t("unverifiedBanner")}</Text>
            <div className="mt-3">
              <ResendVerificationButton />
            </div>
          </Alert>
        ) : null}
        <div className="mt-4">
          <SignOutButton />
        </div>
      </section>

      <section className="mt-10">
        <Heading level={2}>{tOrders("recentOrdersHeading")}</Heading>
        {orders && orders.items.length > 0 ? (
          <>
            <div className="mt-4 flex flex-col">
              {orders.items.map((order) => (
                <OrderSummaryRow key={order.orderId} order={order} locale={locale} />
              ))}
            </div>
            <Link
              href="/account/orders"
              className="mt-4 inline-block text-sm text-accent-600 underline-offset-4 hover:underline"
            >
              {tOrders("viewAllOrders")}
            </Link>
          </>
        ) : (
          <Text tone="muted" className="mt-3">
            {tOrders("emptyTitle")}
          </Text>
        )}
      </section>

      <section className="mt-10 max-w-sm">
        <Heading level={2}>{t("addressesHeading")}</Heading>
        {defaultAddress ? (
          <Text tone="muted" className="mt-3">
            {defaultAddress.name}
            <br />
            {formatAddressLine(defaultAddress)}
          </Text>
        ) : (
          <Text tone="muted" className="mt-3">
            {tAddresses("emptyTitle")}
          </Text>
        )}
        <Link
          href="/account/addresses"
          className="mt-4 inline-block text-sm text-accent-600 underline-offset-4 hover:underline"
        >
          {tAddresses("manageAddresses")}
        </Link>
      </section>
    </Container>
  );
}
