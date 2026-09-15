import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Container, Heading, Text, Badge, Card, Link } from "@ame-de-fil/ui";
import type { MyOrderDetailResponse } from "@ame-de-fil/types";
import { requireSession } from "../../../../../lib/dal";
import { getServerApiClient } from "../../../../../lib/server-api";
import { formatMoney } from "../../../../../lib/format-money";
import type { AppLocale } from "../../../../../lib/locale";
import {
  orderStatusLabelKey,
  orderStatusTone,
  paymentStatusLabelKey,
  shipmentStatusLabelKey,
} from "../../../../../lib/order-status-label";

type PageParams = { locale: AppLocale; orderId: string };

type MyAddress = MyOrderDetailResponse["shippingAddress"];

// Design discussion (docs/plans/customer-order-history): billing address is
// only worth showing when it actually differs from shipping — a second
// identical address block otherwise. Deliberately not "same object
// reference" — these arrive as two independently-serialized snapshots from
// the API, always structurally comparable but never `===`.
function addressesEqual(a: MyAddress, b: MyAddress): boolean {
  return (
    a.name === b.name &&
    a.line1 === b.line1 &&
    a.line2 === b.line2 &&
    a.postalCode === b.postalCode &&
    a.city === b.city &&
    a.country === b.country &&
    a.phone === b.phone
  );
}

async function loadOrder(orderId: string) {
  const client = await getServerApiClient();
  const { data, error, response } = await client.GET("/api/v1/orders/{orderId}", {
    params: { path: { orderId } },
  });
  if (response.status === 404) return null;
  if (error || !data) throw new Error("Failed to load order");
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { orderId } = await params;
  const order = await loadOrder(orderId);
  const t = await getTranslations("Account.Orders");
  return { title: order ? t("detailTitle", { orderNumber: order.orderNumber }) : t("title") };
}

export default async function AccountOrderDetailPage({ params }: { params: Promise<PageParams> }) {
  await requireSession();
  const { locale, orderId } = await params;
  const order = await loadOrder(orderId);
  if (!order) notFound();

  const t = await getTranslations("Account.Orders");
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const showBillingAddress = !addressesEqual(order.shippingAddress, order.billingAddress);
  const latestShipment = order.shipments[0];
  const totalRefunded = order.refunds.reduce((sum, refund) => sum + refund.amount.amountMinor, 0);

  return (
    <Container className="py-16">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <Heading level={1}>{order.orderNumber}</Heading>
          <Text tone="muted" className="mt-1">
            {dateFormatter.format(new Date(order.createdAt))}
          </Text>
        </div>
        <Badge tone={orderStatusTone(order.status)}>{t(`status.${orderStatusLabelKey(order.status)}`)}</Badge>
      </div>

      <Card className="mt-8">
        <div className="flex flex-col">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between gap-4 border-b border-neutral-200 py-4 last:border-b-0 last:pb-0">
              <div>
                <Text>{item.productName}</Text>
                <Text size="sm" tone="muted" className="mt-1">
                  {item.variantLabel} × {item.quantity}
                </Text>
              </div>
              <Text>{formatMoney(item.lineTotal.amountMinor, locale)}</Text>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-1">
          <div className="flex justify-between">
            <Text size="sm" tone="muted">
              {t("subtotal")}
            </Text>
            <Text size="sm">{formatMoney(order.subtotal.amountMinor, locale)}</Text>
          </div>
          <div className="flex justify-between">
            <Text size="sm" tone="muted">
              {t("shipping")} ({order.shippingMethodName})
            </Text>
            <Text size="sm">{formatMoney(order.shipping.amountMinor, locale)}</Text>
          </div>
          {order.discount.amountMinor > 0 ? (
            <div className="flex justify-between">
              <Text size="sm" tone="muted">
                {t("discount")}
              </Text>
              <Text size="sm">−{formatMoney(order.discount.amountMinor, locale)}</Text>
            </div>
          ) : null}
          <div className="flex justify-between">
            <Text size="sm" tone="muted">
              {t("tax")}
            </Text>
            <Text size="sm">{formatMoney(order.tax.amountMinor, locale)}</Text>
          </div>
          <div className="mt-2 flex justify-between border-t border-neutral-200 pt-2">
            <Text>{t("total")}</Text>
            <Text>{formatMoney(order.total.amountMinor, locale)}</Text>
          </div>
        </div>

        {/* Payment: one quiet inline line, never a "Payments" history — this
            project's checkout only ever creates one Payment per order. A
            refund, when one exists, is an added note right here, never its
            own permanent section (design discussion). */}
        {order.payment ? (
          <Text size="sm" tone="muted" className="mt-4">
            {t("paymentLine", {
              method: order.payment.method ?? t("paymentMethodUnknown"),
              amount: formatMoney(order.payment.amount.amountMinor, locale),
              status: t(`paymentStatus.${paymentStatusLabelKey(order.payment.status)}`),
            })}
            {totalRefunded > 0
              ? ` — ${t("refundedNote", {
                  amount: formatMoney(totalRefunded, locale),
                  date: dateFormatter.format(
                    new Date(order.refunds[0]!.processedAt ?? order.refunds[0]!.createdAt),
                  ),
                })}`
              : null}
          </Text>
        ) : null}
      </Card>

      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        <div>
          <Heading level={2}>{t("shippingAddress")}</Heading>
          <AddressBlock address={order.shippingAddress} />
        </div>
        {showBillingAddress ? (
          <div>
            <Heading level={2}>{t("billingAddress")}</Heading>
            <AddressBlock address={order.billingAddress} />
          </div>
        ) : null}
      </div>

      {latestShipment ? (
        <div className="mt-8">
          <Heading level={2}>{t("delivery")}</Heading>
          <Text tone="muted" className="mt-2">
            {t(`shipmentStatus.${shipmentStatusLabelKey(latestShipment.status)}`)}
            {latestShipment.carrierName ? ` — ${latestShipment.carrierName}` : null}
            {latestShipment.trackingNumber ? ` (${latestShipment.trackingNumber})` : null}
          </Text>
          {latestShipment.trackingUrl ? (
            <Link
              href={latestShipment.trackingUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm"
            >
              {t("trackShipment")}
            </Link>
          ) : null}
        </div>
      ) : null}
    </Container>
  );
}

function AddressBlock({ address }: { address: MyAddress }) {
  return (
    <Text tone="muted" className="mt-2">
      {address.name}
      <br />
      {address.line1}
      {address.line2 ? (
        <>
          <br />
          {address.line2}
        </>
      ) : null}
      <br />
      {address.postalCode} {address.city}
      <br />
      {address.country}
    </Text>
  );
}
