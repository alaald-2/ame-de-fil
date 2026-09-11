import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { Heading, Text, Link, Badge, Card, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../../lib/dal";
import { getServerApiClient } from "../../../../lib/server-api";
import { orderStatusTone } from "../../../../lib/order-status";
import { formatMoney } from "../../../../lib/format-money";
import type { AdminLocale } from "../../../../i18n/config";

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>;
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
}

function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

// Real GET /admin/customers/:id data — view-only, matching exactly what the
// backend already returns (profile fields + its own capped recent-order
// history). No mutations here: address book, notes, and any update/
// deactivate action don't exist server-side (ROADMAP.md's Customer
// management entry lists them as deliberately unbuilt), so there is
// nothing to submit on this page — a pure Server Component, unlike
// Administration's user detail page which has two client-island mutations.
export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  await requireSession();
  const { id } = await params;

  const t = await getTranslations("Customers");
  const td = await getTranslations("Customers.detail");
  const tOrders = await getTranslations("Orders");
  const locale = (await getLocale()) as AdminLocale;
  const client = await getServerApiClient();

  const { data: customer, error, response } = await client.GET("/api/v1/admin/customers/{id}", {
    params: { path: { id } },
  });

  if (error) {
    if (response.status === 404) notFound();
    return (
      <ErrorState
        className="mt-6"
        title={response.status === 403 ? t("forbiddenTitle") : td("detailErrorTitle")}
        description={response.status === 403 ? t("forbiddenDescription") : td("detailErrorDescription")}
      />
    );
  }

  return (
    <div>
      <Link href="/customers" className="text-sm">
        &larr; {td("backToCustomers")}
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <Heading level={1}>{customer.email}</Heading>
        <Badge tone={customer.status === "ACTIVE" ? "success" : "neutral"}>
          {customer.status === "ACTIVE" ? t("statusActive") : t("statusDisabled")}
        </Badge>
      </div>

      {(() => {
        const fullName = [customer.firstName, customer.lastName].filter(Boolean).join(" ");
        // Omitted entirely when neither name is set, rather than falling
        // back to a lone "-" — same reasoning as the Administration user
        // detail page's own identical pattern.
        return fullName ? <Text tone="muted" className="mt-1">{fullName}</Text> : null;
      })()}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <Heading level={2} className="mb-3">
            {td("recentOrdersHeading")}
          </Heading>
          {customer.recentOrders.length === 0 ? (
            <Text size="sm" tone="muted">
              {td("noOrdersYet")}
            </Text>
          ) : (
            <ul className="flex flex-col divide-y divide-neutral-200">
              {customer.recentOrders.map((order) => (
                <li key={order.orderId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <Link href={`/orders/${order.orderId}`} className="font-medium">
                    {order.orderNumber}
                  </Link>
                  <div className="flex items-center gap-4">
                    <Badge tone={orderStatusTone(order.status)}>{tOrders(`status.${order.status}`)}</Badge>
                    <Text size="sm" className="tabular-nums">
                      {formatMoney(order.total.amountMinor, locale)}
                    </Text>
                    <Text size="sm" tone="muted">
                      {formatDate(order.createdAt, locale)}
                    </Text>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Card className="h-fit">
          <Heading level={2} className="mb-4">
            {td("accountInfoHeading")}
          </Heading>
          <div className="flex flex-col gap-3">
            <InfoRow label={td("phoneLabel")} value={customer.phone ?? t("nameFallback")} />
            <InfoRow label={td("localeLabel")} value={customer.locale} />
            <InfoRow
              label={td("emailVerifiedLabel")}
              value={customer.emailVerifiedAt ? formatDate(customer.emailVerifiedAt, locale) : td("notVerified")}
            />
            <InfoRow label={td("orderCountLabel")} value={String(customer.orderCount)} />
            <InfoRow label={td("createdLabel")} value={formatDateTime(customer.createdAt, locale)} />
            <InfoRow label={td("updatedLabel")} value={formatDateTime(customer.updatedAt, locale)} />
            <InfoRow
              label={td("lastLoginLabel")}
              value={customer.lastLoginAt ? formatDateTime(customer.lastLoginAt, locale) : t("never")}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <Text size="sm" tone="muted">
        {label}
      </Text>
      <Text size="sm" className="text-right">
        {value}
      </Text>
    </div>
  );
}
