import { Fragment } from "react";
import {
  Body,
  Container,
  Column,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import { h } from "./h.ts";

// No JSX anywhere in this package (DECISIONS.md ADR-031) — plain `h()`
// (a createElement wrapper, ./h.ts) calls instead. This is a Tier 2
// package (ADR-023: source-only, consumed directly via Node's native
// type-stripping at runtime, no build step), and Node's type stripping
// only erases type annotations — it has no JSX transform, so a `.tsx` file
// throws ERR_UNKNOWN_FILE_EXTENSION the moment apps/api actually runs it,
// not just at typecheck time. Verbose, but functionally identical to JSX
// (JSX is sugar for exactly these calls) and keeps this package genuinely
// buildless like every other Tier 2 package.
//
// Plain locale prop, switched on directly — next-intl's pattern isn't
// available outside Next.js (packages/email is consumed only by apps/api,
// a NestJS backend), mirroring the same idiom
// apps/api/src/checkout/checkout-cart.ts's resolveVariantLabel already
// uses for bilingual customer-facing content outside next-intl's reach.
export type EmailLocale = "sv-SE" | "en";

export interface OrderConfirmationItem {
  name: string;
  variantLabel: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface OrderConfirmationAddress {
  name: string;
  line1: string;
  line2?: string | null;
  postalCode: string;
  city: string;
  country: string;
}

export interface OrderConfirmationEmailProps {
  locale: EmailLocale;
  orderNumber: string;
  items: OrderConfirmationItem[];
  subtotalMinor: number;
  shippingMinor: number;
  discountMinor: number;
  totalMinor: number;
  currency: string;
  shippingAddress: OrderConfirmationAddress;
}

function formatMoney(minor: number, currency: string, locale: EmailLocale): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100);
}

const COPY = {
  "sv-SE": {
    preview: (orderNumber: string) => `Tack för din beställning ${orderNumber}`,
    heading: "Tack för din beställning!",
    intro: (orderNumber: string) => `Vi har mottagit din beställning ${orderNumber}.`,
    itemHeader: "Artikel",
    qtyHeader: "Antal",
    priceHeader: "Pris",
    subtotal: "Delsumma",
    discount: "Rabatt",
    shipping: "Frakt",
    total: "Totalt",
    shippingAddress: "Leveransadress",
  },
  en: {
    preview: (orderNumber: string) => `Thank you for your order ${orderNumber}`,
    heading: "Thank you for your order!",
    intro: (orderNumber: string) => `We've received your order ${orderNumber}.`,
    itemHeader: "Item",
    qtyHeader: "Qty",
    priceHeader: "Price",
    subtotal: "Subtotal",
    discount: "Discount",
    shipping: "Shipping",
    total: "Total",
    shippingAddress: "Shipping address",
  },
} as const;

export function OrderConfirmationEmail(props: OrderConfirmationEmailProps) {
  const t = COPY[props.locale];
  const money = (minor: number) => formatMoney(minor, props.currency, props.locale);

  const itemRows = props.items.map((item, index) =>
    h(
      Row,
      { key: index },
      h(Column, null, item.name + (item.variantLabel ? ` — ${item.variantLabel}` : "")),
      h(Column, { align: "right" }, item.quantity),
      h(Column, { align: "right" }, money(item.lineTotalMinor)),
    ),
  );

  const discountRow =
    props.discountMinor > 0
      ? h(
          Row,
          null,
          h(Column, null, t.discount),
          h(Column, { align: "right" }, `-${money(props.discountMinor)}`),
        )
      : null;

  const addressLine2 = props.shippingAddress.line2
    ? h(Fragment, null, h("br", null), props.shippingAddress.line2)
    : null;

  return h(
    Html,
    { lang: props.locale },
    h(Head, null),
    h(Preview, null, t.preview(props.orderNumber)),
    h(
      Body,
      { style: { fontFamily: "sans-serif", backgroundColor: "#f6f6f4" } },
      h(
        Container,
        { style: { backgroundColor: "#ffffff", padding: "32px" } },
        h(Heading, { as: "h1" }, t.heading),
        h(Text, null, t.intro(props.orderNumber)),
        h(Hr, null),
        h(
          Row,
          { style: { fontWeight: "bold" } },
          h(Column, null, t.itemHeader),
          h(Column, { align: "right" }, t.qtyHeader),
          h(Column, { align: "right" }, t.priceHeader),
        ),
        ...itemRows,
        h(Hr, null),
        h(
          Row,
          null,
          h(Column, null, t.subtotal),
          h(Column, { align: "right" }, money(props.subtotalMinor)),
        ),
        discountRow,
        h(
          Row,
          null,
          h(Column, null, t.shipping),
          h(Column, { align: "right" }, money(props.shippingMinor)),
        ),
        h(
          Row,
          { style: { fontWeight: "bold" } },
          h(Column, null, t.total),
          h(Column, { align: "right" }, money(props.totalMinor)),
        ),
        h(Hr, null),
        h(
          Section,
          null,
          h(Text, { style: { fontWeight: "bold" } }, t.shippingAddress),
          h(
            Text,
            null,
            props.shippingAddress.name,
            h("br", null),
            props.shippingAddress.line1,
            addressLine2,
            h("br", null),
            `${props.shippingAddress.postalCode} ${props.shippingAddress.city}`,
            h("br", null),
            props.shippingAddress.country,
          ),
        ),
      ),
    ),
  );
}
