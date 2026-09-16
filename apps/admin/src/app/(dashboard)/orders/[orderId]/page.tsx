import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import {
  Heading,
  Text,
  Link,
  Badge,
  Card,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  ErrorState,
} from "@ame-de-fil/ui";
import { requireSession } from "../../../../lib/dal";
import { getServerApiClient } from "../../../../lib/server-api";
import { formatMoney } from "../../../../lib/format-money";
import {
  orderStatusTone,
  paymentStatusTone,
  shipmentStatusTone,
  hasRefundablePayment,
} from "../../../../lib/order-status";
import { OrderFulfillmentActions } from "../../../../components/order-fulfillment-actions";
import { RefundDialog } from "../../../../components/refund-dialog";
import { PrintReceiptButton } from "../../../../components/print-receipt-button";
import { OrderReceipt, getReceiptTranslations } from "../../../../components/order-receipt";
import type { AdminLocale } from "../../../../i18n/config";

interface OrderDetailPageProps {
  params: Promise<{ orderId: string }>;
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const session = await requireSession();
  const { orderId } = await params;

  const t = await getTranslations("Orders");
  const td = await getTranslations("Orders.detail");
  const locale = (await getLocale()) as AdminLocale;
  const client = await getServerApiClient();

  const [{ data: order, error, response }, storeSettingsResult] = await Promise.all([
    client.GET("/api/v1/admin/orders/{orderId}", { params: { path: { orderId } } }),
    client.GET("/api/v1/admin/store-settings"),
  ]);

  if (error) {
    if (response.status === 404) notFound();
    return (
      <ErrorState
        className="mt-6"
        title={response.status === 403 ? t("forbiddenTitle") : t("detailErrorTitle")}
        description={
          response.status === 403 ? t("forbiddenDescription") : t("detailErrorDescription")
        }
      />
    );
  }

  // A 403 here (admin lacks settings.view) just means no store letterhead
  // on the printed receipt — never a reason to break the whole order page.
  const storeSettings = !storeSettingsResult.error ? storeSettingsResult.data : null;
  const receiptTranslations = await getReceiptTranslations();

  const permissions = session.user.permissions;
  const canFulfill = permissions.includes("orders.fulfill");
  const canRefund = permissions.includes("orders.refund") && hasRefundablePayment(order.payments);

  return (
    <>
      <OrderReceipt
        order={order}
        settings={storeSettings}
        locale={locale}
        translations={receiptTranslations}
      />
      <div className="no-print">
        <Link href="/orders" className="text-sm">
          &larr; {td("backToOrders")}
        </Link>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Heading level={1}>{order.orderNumber}</Heading>
            <Badge tone={orderStatusTone(order.status)}>{t(`status.${order.status}`)}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PrintReceiptButton label={td("printReceipt")} />
            {canFulfill ? (
              <OrderFulfillmentActions orderId={order.orderId} status={order.status} />
            ) : null}
            {canRefund ? (
              <RefundDialog orderId={order.orderId} defaultAmountMinor={order.total.amountMinor} />
            ) : null}
          </div>
        </div>

        <Text tone="muted" className="mt-1">
          {order.customer.name ?? order.customer.email} · {formatDate(order.createdAt, locale)}
        </Text>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
          <div>
            <Heading level={2} className="mb-3">
              {td("items")}
            </Heading>
            <div className="overflow-x-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>{td("columnProduct")}</TableHeaderCell>
                    <TableHeaderCell className="text-right">{td("quantityAbbr")}</TableHeaderCell>
                    <TableHeaderCell className="text-right">{td("total")}</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {order.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium text-neutral-900">{item.productName}</div>
                        <div className="text-xs text-neutral-600">
                          {item.variantLabel}
                          {item.articleNumber !== null ? ` · #${item.articleNumber}` : ""}
                          {item.sku ? ` · ${item.sku}` : ""}
                          {item.madeToOrder ? ` · ${td("madeToOrder")}` : ""}
                        </div>
                      </TableCell>
                      <TableCell numeric>{item.quantity}</TableCell>
                      <TableCell numeric>
                        {formatMoney(item.lineTotal.amountMinor, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <Card>
                <Heading level={3} className="mb-3">
                  {td("shippingAddress")}
                </Heading>
                <AddressBlock address={order.shippingAddress} />
              </Card>
              <Card>
                <Heading level={3} className="mb-3">
                  {td("billingAddress")}
                </Heading>
                <AddressBlock address={order.billingAddress} />
              </Card>
            </div>

            <div className="mt-8">
              <Heading level={2} className="mb-3">
                {td("payments")}
              </Heading>
              {order.payments.length === 0 ? (
                <Text tone="muted">{td("noPayments")}</Text>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>{t("columnStatus")}</TableHeaderCell>
                        <TableHeaderCell>{t("columnPayment")}</TableHeaderCell>
                        <TableHeaderCell className="text-right">{t("columnTotal")}</TableHeaderCell>
                        <TableHeaderCell>{t("columnPlaced")}</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {order.payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>
                            <Badge tone={paymentStatusTone(payment.status)}>
                              {t(`paymentStatus.${payment.status}`)}
                            </Badge>
                          </TableCell>
                          <TableCell>{payment.method ?? payment.provider}</TableCell>
                          <TableCell numeric>
                            {formatMoney(payment.amount.amountMinor, locale)}
                          </TableCell>
                          <TableCell>{formatDate(payment.createdAt, locale)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {order.shipments.length > 0 ? (
              <div className="mt-8">
                <Heading level={2} className="mb-3">
                  {td("shipments")}
                </Heading>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>{t("columnStatus")}</TableHeaderCell>
                        <TableHeaderCell>{td("carrier")}</TableHeaderCell>
                        <TableHeaderCell>{td("trackingNumber")}</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {order.shipments.map((shipment) => (
                        <TableRow key={shipment.id}>
                          <TableCell>
                            <Badge tone={shipmentStatusTone(shipment.status)}>
                              {t(`shipmentStatus.${shipment.status}`)}
                            </Badge>
                          </TableCell>
                          <TableCell>{shipment.carrierName ?? t("none")}</TableCell>
                          <TableCell>
                            {shipment.trackingUrl && shipment.trackingNumber ? (
                              <Link href={shipment.trackingUrl}>{shipment.trackingNumber}</Link>
                            ) : (
                              (shipment.trackingNumber ?? t("none"))
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}
          </div>

          <Card className="h-fit">
            <Heading level={2} className="mb-4">
              {td("summary")}
            </Heading>
            <div className="flex flex-col gap-2">
              <SummaryRow
                label={td("subtotal")}
                value={formatMoney(order.subtotal.amountMinor, locale)}
              />
              <SummaryRow
                label={td("shipping")}
                value={formatMoney(order.shipping.amountMinor, locale)}
              />
              {order.discount.amountMinor > 0 ? (
                <SummaryRow
                  label={td("discount")}
                  value={`-${formatMoney(order.discount.amountMinor, locale)}`}
                />
              ) : null}
              <SummaryRow label={td("tax")} value={formatMoney(order.tax.amountMinor, locale)} />
              <div className="mt-2 flex justify-between border-t border-neutral-200 pt-2">
                <Text className="font-medium text-neutral-900">{td("total")}</Text>
                <Text className="font-medium text-neutral-900 tabular-nums">
                  {formatMoney(order.total.amountMinor, locale)}
                </Text>
              </div>
            </div>
            <div className="mt-4 border-t border-neutral-200 pt-4">
              <Text size="sm" tone="muted">
                {td("shippingMethod")}
              </Text>
              <Text size="sm">{order.shippingMethodName}</Text>
            </div>
            {order.pickupPointName ? (
              <div className="mt-4 border-t border-neutral-200 pt-4">
                <Text size="sm" tone="muted">
                  {td("pickupPoint")}
                </Text>
                <Text size="sm">{order.pickupPointName}</Text>
                {order.pickupPointAddress ? (
                  <Text size="sm" tone="muted">
                    {order.pickupPointAddress}
                  </Text>
                ) : null}
                {order.pickupPointId ? (
                  <Text size="sm" tone="muted" className="mt-1">
                    {td("pickupPointId")}: {order.pickupPointId}
                  </Text>
                ) : null}
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <Text size="sm" tone="muted">
        {label}
      </Text>
      <Text size="sm" className="tabular-nums">
        {value}
      </Text>
    </div>
  );
}

interface AddressLike {
  name: string;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  country: string;
  phone: string | null;
}

function AddressBlock({ address }: { address: AddressLike }) {
  return (
    <div className="flex flex-col gap-0.5 text-sm text-neutral-800">
      <span>{address.name}</span>
      <span>{address.line1}</span>
      {address.line2 ? <span>{address.line2}</span> : null}
      <span>
        {address.postalCode} {address.city}
      </span>
      <span>{address.country}</span>
      {address.phone ? <span className="mt-1 text-neutral-600">{address.phone}</span> : null}
    </div>
  );
}
