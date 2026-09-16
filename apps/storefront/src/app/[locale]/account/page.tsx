import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  Container,
  Heading,
  Text,
  Alert,
  Card,
  PersonIcon,
  LockClosedIcon,
  ArchiveIcon,
  HomeIcon,
} from "@ame-de-fil/ui";
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

// The account hub — Profile/Security/Addresses as compact cards in a row
// (design discussion, docs/plans) matching the two-card grid already
// established in apps/admin's order-detail page (shipping/billing address
// cards), with Recent orders as a full-width card below since its content
// varies in length. A hairline border, not a shadow (DESIGN_SYSTEM.md §5)
// — Card already enforces that. No placeholder cards for Wishlist/Reviews/
// Preferences etc. — those get a card here only once they're real.
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

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <Card>
          <div className="mb-3 flex items-center gap-2 text-neutral-500">
            <PersonIcon aria-hidden="true" className="h-4 w-4" />
            <Heading level={3}>{t("profileHeading")}</Heading>
          </div>
          <Text size="lg" className="text-neutral-900">
            {displayName}
          </Text>
          <Text tone="muted" className="mt-1">
            {user.email}
          </Text>
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2 text-neutral-500">
            <LockClosedIcon aria-hidden="true" className="h-4 w-4" />
            <Heading level={3}>{t("securityHeading")}</Heading>
          </div>
          {!user.emailVerifiedAt ? (
            <Alert tone="info" className="mb-4">
              <Text size="sm">{t("unverifiedBanner")}</Text>
              <div className="mt-3">
                <ResendVerificationButton />
              </div>
            </Alert>
          ) : null}
          <SignOutButton />
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2 text-neutral-500">
            <HomeIcon aria-hidden="true" className="h-4 w-4" />
            <Heading level={3}>{t("addressesHeading")}</Heading>
          </div>
          {defaultAddress ? (
            <Text tone="muted">
              {defaultAddress.name}
              <br />
              {formatAddressLine(defaultAddress)}
            </Text>
          ) : (
            <Text tone="muted">{tAddresses("emptyTitle")}</Text>
          )}
          <Link
            href="/account/addresses"
            className="mt-4 inline-block text-sm text-accent-600 underline-offset-4 hover:underline"
          >
            {tAddresses("manageAddresses")}
          </Link>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="mb-4 flex items-center gap-2 text-neutral-500">
          <ArchiveIcon aria-hidden="true" className="h-4 w-4" />
          <Heading level={3}>{tOrders("recentOrdersHeading")}</Heading>
        </div>
        {orders && orders.items.length > 0 ? (
          <>
            <div className="flex flex-col">
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
          <Text tone="muted">{tOrders("emptyTitle")}</Text>
        )}
      </Card>
    </Container>
  );
}
