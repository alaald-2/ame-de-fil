import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Text } from "@react-email/components";
import { h } from "./h.ts";
import type { EmailLocale } from "./order-confirmation.ts";

// No JSX — see order-confirmation.ts's top comment (DECISIONS.md ADR-031)
// for why this Tier 2 package can't use `.tsx`/JSX at all.
//
// `verificationUrl` is built by the caller (NotificationsService, from
// STOREFRONT_BASE_URL) — this template does zero URL construction itself,
// same pattern as ShippingNotificationEmail's `trackingUrl`.
export interface EmailVerificationEmailProps {
  locale: EmailLocale;
  verificationUrl: string;
}

const COPY = {
  "sv-SE": {
    preview: "Bekräfta din e-postadress hos Âme de Fil",
    heading: "Bekräfta din e-postadress",
    intro: "Tack för att du skapar ett konto hos Âme de Fil. Klicka på länken nedan för att bekräfta din e-postadress.",
    cta: "Bekräfta e-postadress",
    ignore: "Om du inte skapade det här kontot kan du bortse från det här mejlet.",
  },
  en: {
    preview: "Confirm your email address for Âme de Fil",
    heading: "Confirm your email address",
    intro: "Thanks for creating an account with Âme de Fil. Click the link below to confirm your email address.",
    cta: "Confirm email address",
    ignore: "If you didn't create this account, you can safely ignore this email.",
  },
} as const;

export function EmailVerificationEmail(props: EmailVerificationEmailProps) {
  const t = COPY[props.locale];

  return h(
    Html,
    { lang: props.locale },
    h(Head, null),
    h(Preview, null, t.preview),
    h(
      Body,
      { style: { fontFamily: "sans-serif", backgroundColor: "#f6f6f4" } },
      h(
        Container,
        { style: { backgroundColor: "#ffffff", padding: "32px" } },
        h(Heading, { as: "h1" }, t.heading),
        h(Text, null, t.intro),
        h(Link, { href: props.verificationUrl }, t.cta),
        h(Hr, null),
        h(Text, null, t.ignore),
      ),
    ),
  );
}
