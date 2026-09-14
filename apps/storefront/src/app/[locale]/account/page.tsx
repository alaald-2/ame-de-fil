import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container, Heading, Text, Alert } from "@ame-de-fil/ui";
import { requireSession } from "../../../lib/dal";
import { SignOutButton } from "../../../components/sign-out-button";
import { ResendVerificationButton } from "../../../components/resend-verification-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Account");
  return { title: t("title") };
}

// The account page — this checkpoint's only protected storefront route
// (requireSession redirects to /login?from=/account, or the localized
// equivalent, when there's no session). Deliberately just identity + sign
// out: there is no customer-facing "list my own orders" endpoint yet
// (orders.controller.ts's own GET :orderId/status is a single-order,
// deliberately minimal polling endpoint — DECISIONS.md ADR-024 — not a
// listing one), so an order-history section here would have nothing real
// to call. Add one once that endpoint exists, rather than fetching admin
// data this app has no door to (ARCHITECTURE.md §1).
export default async function AccountPage() {
  const t = await getTranslations("Account");
  const { user } = await requireSession();
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  return (
    <Container className="py-16">
      <Heading level={1}>{t("title")}</Heading>
      <div className="mt-8 max-w-sm">
        <Text size="lg" className="text-neutral-900">
          {displayName}
        </Text>
        <Text tone="muted" className="mt-1">
          {user.email}
        </Text>

        {!user.emailVerifiedAt ? (
          <Alert tone="info" className="mt-6">
            <Text size="sm">{t("unverifiedBanner")}</Text>
            <div className="mt-3">
              <ResendVerificationButton />
            </div>
          </Alert>
        ) : null}

        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </Container>
  );
}
