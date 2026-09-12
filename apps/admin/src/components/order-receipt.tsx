import { getTranslations } from "next-intl/server";
import { formatMoney } from "../lib/format-money";
import type { AdminLocale } from "../i18n/config";

interface ReceiptMoney {
  amountMinor: number;
}

interface ReceiptItem {
  id: string;
  productName: string;
  variantLabel: string;
  sku: string | null;
  articleNumber: number | null;
  quantity: number;
  lineTotal: ReceiptMoney;
}

interface ReceiptAddress {
  name: string;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  country: string;
  phone: string | null;
}

interface ReceiptRefund {
  amount: ReceiptMoney;
  status: string;
}

interface ReceiptPayment {
  method: string | null;
  provider: string;
  status: string;
  refunds: ReceiptRefund[];
}

export interface ReceiptOrder {
  orderNumber: string;
  createdAt: string;
  customer: { name: string | null; email: string };
  items: ReceiptItem[];
  shippingAddress: ReceiptAddress;
  subtotal: ReceiptMoney;
  shipping: ReceiptMoney;
  discount: ReceiptMoney;
  tax: ReceiptMoney;
  total: ReceiptMoney;
  payments: ReceiptPayment[];
}

export interface ReceiptStoreSettings {
  businessName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  orgNumber: string | null;
  vatNumber: string | null;
  phone: string | null;
  email: string | null;
  showAddress: boolean;
  showOrgNumber: boolean;
  showVatNumber: boolean;
  showPhone: boolean;
  showEmail: boolean;
}

interface OrderReceiptProps {
  order: ReceiptOrder;
  settings: ReceiptStoreSettings | null;
  locale: AdminLocale;
  translations: {
    heading: string;
    orderNumberLabel: string;
    dateLabel: string;
    customerLabel: string;
    itemHeader: string;
    qtyHeader: string;
    unitPriceHeader: string;
    lineTotalHeader: string;
    subtotalLabel: string;
    shippingLabel: string;
    discountLabel: string;
    vatLabel: string;
    totalLabel: string;
    refundedLabel: string;
    paymentStatusLabel: string;
  };
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
}

// Plain presentational function — always in the DOM (server-rendered),
// hidden by .print-only/.no-print (globals.css) so it only ever becomes
// visible via the print stylesheet, never on screen. Business info comes
// from StoreSettings, gated per-field by its own show* toggles (§
// store-settings-form.tsx) — the order/items/totals below are always
// shown, since those are the receipt's actual substance, not letterhead.
export function OrderReceipt({ order, settings, locale, translations: t }: OrderReceiptProps) {
  const refundedMinor = order.payments
    .flatMap((payment) => payment.refunds)
    .filter((refund) => refund.status === "SUCCEEDED")
    .reduce((sum, refund) => sum + refund.amount.amountMinor, 0);
  const lastPaymentStatus = order.payments.at(-1)?.status ?? null;

  return (
    <div className="print-only p-8 text-sm text-black">
      {settings?.businessName ? (
        <div className="text-lg font-semibold">{settings.businessName}</div>
      ) : null}
      {settings?.showAddress && (settings.addressLine1 || settings.city) ? (
        <div>
          {settings.addressLine1}
          {settings.addressLine2 ? `, ${settings.addressLine2}` : ""}
          {settings.postalCode || settings.city
            ? `, ${settings.postalCode ?? ""} ${settings.city ?? ""}`.trim()
            : ""}
          {settings.country ? `, ${settings.country}` : ""}
        </div>
      ) : null}
      {settings?.showOrgNumber && settings.orgNumber ? <div>{settings.orgNumber}</div> : null}
      {settings?.showVatNumber && settings.vatNumber ? <div>{settings.vatNumber}</div> : null}
      {settings?.showPhone && settings.phone ? <div>{settings.phone}</div> : null}
      {settings?.showEmail && settings.email ? <div>{settings.email}</div> : null}

      <h1 className="mt-6 text-xl font-semibold">{t.heading}</h1>
      <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1">
        <div>{t.orderNumberLabel}</div>
        <div>{order.orderNumber}</div>
        <div>{t.dateLabel}</div>
        <div>{formatDate(order.createdAt, locale)}</div>
        <div>{t.customerLabel}</div>
        <div>{order.customer.name ?? order.customer.email}</div>
      </div>

      <div className="mt-4">
        <div>{order.shippingAddress.name}</div>
        <div>{order.shippingAddress.line1}</div>
        {order.shippingAddress.line2 ? <div>{order.shippingAddress.line2}</div> : null}
        <div>
          {order.shippingAddress.postalCode} {order.shippingAddress.city}
        </div>
        <div>{order.shippingAddress.country}</div>
      </div>

      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1">{t.itemHeader}</th>
            <th className="py-1 text-right">{t.qtyHeader}</th>
            <th className="py-1 text-right">{t.lineTotalHeader}</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="border-b border-neutral-300">
              <td className="py-1">
                {item.productName}
                <br />
                <span className="text-xs">
                  {item.variantLabel}
                  {item.articleNumber !== null ? ` · #${item.articleNumber}` : ""}
                  {item.sku ? ` · ${item.sku}` : ""}
                </span>
              </td>
              <td className="py-1 text-right">{item.quantity}</td>
              <td className="py-1 text-right">{formatMoney(item.lineTotal.amountMinor, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 ml-auto flex max-w-xs flex-col gap-1">
        <div className="flex justify-between">
          <span>{t.subtotalLabel}</span>
          <span>{formatMoney(order.subtotal.amountMinor, locale)}</span>
        </div>
        <div className="flex justify-between">
          <span>{t.shippingLabel}</span>
          <span>{formatMoney(order.shipping.amountMinor, locale)}</span>
        </div>
        {order.discount.amountMinor > 0 ? (
          <div className="flex justify-between">
            <span>{t.discountLabel}</span>
            <span>-{formatMoney(order.discount.amountMinor, locale)}</span>
          </div>
        ) : null}
        <div className="flex justify-between">
          <span>{t.vatLabel}</span>
          <span>{formatMoney(order.tax.amountMinor, locale)}</span>
        </div>
        <div className="flex justify-between border-t border-black pt-1 font-semibold">
          <span>{t.totalLabel}</span>
          <span>{formatMoney(order.total.amountMinor, locale)}</span>
        </div>
        {refundedMinor > 0 ? (
          <div className="flex justify-between">
            <span>{t.refundedLabel}</span>
            <span>-{formatMoney(refundedMinor, locale)}</span>
          </div>
        ) : null}
      </div>

      {lastPaymentStatus ? (
        <div className="mt-6">
          {t.paymentStatusLabel}: {lastPaymentStatus}
        </div>
      ) : null}
    </div>
  );
}

// Server-side helper so the order-detail page can gather every receipt
// string in one place, mirroring how it already collects every other
// section's translations via getTranslations.
export async function getReceiptTranslations() {
  const t = await getTranslations("Orders.detail.receipt");
  return {
    heading: t("heading"),
    orderNumberLabel: t("orderNumberLabel"),
    dateLabel: t("dateLabel"),
    customerLabel: t("customerLabel"),
    itemHeader: t("itemHeader"),
    qtyHeader: t("qtyHeader"),
    unitPriceHeader: t("unitPriceHeader"),
    lineTotalHeader: t("lineTotalHeader"),
    subtotalLabel: t("subtotalLabel"),
    shippingLabel: t("shippingLabel"),
    discountLabel: t("discountLabel"),
    vatLabel: t("vatLabel"),
    totalLabel: t("totalLabel"),
    refundedLabel: t("refundedLabel"),
    paymentStatusLabel: t("paymentStatusLabel"),
  };
}
