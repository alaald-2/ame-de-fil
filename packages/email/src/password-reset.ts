import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Text } from "@react-email/components";
import { h } from "./h.ts";
import type { EmailLocale } from "./order-confirmation.ts";

// No JSX — see order-confirmation.ts's top comment (DECISIONS.md ADR-031).
// `resetUrl` is built by the caller, same pattern as EmailVerificationEmail.
export interface PasswordResetEmailProps {
  locale: EmailLocale;
  resetUrl: string;
}

const COPY = {
  "sv-SE": {
    preview: "Återställ ditt lösenord hos Âme de Fil",
    heading: "Återställ ditt lösenord",
    intro: "Vi fick en begäran om att återställa lösenordet för ditt konto. Klicka på länken nedan för att välja ett nytt lösenord.",
    cta: "Återställ lösenord",
    expiry: "Länken slutar gälla om en timme.",
    ignore: "Om du inte begärde det här kan du bortse från det här mejlet — ditt lösenord ändras inte.",
  },
  en: {
    preview: "Reset your password for Âme de Fil",
    heading: "Reset your password",
    intro: "We received a request to reset the password for your account. Click the link below to choose a new password.",
    cta: "Reset password",
    expiry: "This link expires in one hour.",
    ignore: "If you didn't request this, you can safely ignore this email — your password won't change.",
  },
} as const;

export function PasswordResetEmail(props: PasswordResetEmailProps) {
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
        h(Link, { href: props.resetUrl }, t.cta),
        h(Text, null, t.expiry),
        h(Hr, null),
        h(Text, null, t.ignore),
      ),
    ),
  );
}
