import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";
import { h } from "./h.ts";
import type { EmailLocale } from "./order-confirmation.ts";

// No JSX — see order-confirmation.ts's top comment (DECISIONS.md ADR-031)
// for why this Tier 2 package can't use `.tsx`/JSX at all.
export interface ShippingNotificationEmailProps {
  locale: EmailLocale;
  orderNumber: string;
  carrierName?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
}

const COPY = {
  "sv-SE": {
    preview: (orderNumber: string) => `Din beställning ${orderNumber} har skickats`,
    heading: "Din beställning har skickats!",
    intro: (orderNumber: string) => `Din beställning ${orderNumber} är nu på väg.`,
    carrier: "Fraktbolag",
    trackingNumber: "Spårningsnummer",
    trackingLink: "Spåra din leverans",
  },
  en: {
    preview: (orderNumber: string) => `Your order ${orderNumber} has shipped`,
    heading: "Your order has shipped!",
    intro: (orderNumber: string) => `Your order ${orderNumber} is on its way.`,
    carrier: "Carrier",
    trackingNumber: "Tracking number",
    trackingLink: "Track your delivery",
  },
} as const;

export function ShippingNotificationEmail(props: ShippingNotificationEmailProps) {
  const t = COPY[props.locale];

  const carrierText = props.carrierName
    ? h(Text, null, `${t.carrier}: ${props.carrierName}`)
    : null;
  const trackingNumberText = props.trackingNumber
    ? h(Text, null, `${t.trackingNumber}: ${props.trackingNumber}`)
    : null;
  const trackingLink = props.trackingUrl
    ? h(Link, { href: props.trackingUrl }, t.trackingLink)
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
        carrierText,
        trackingNumberText,
        trackingLink,
      ),
    ),
  );
}
