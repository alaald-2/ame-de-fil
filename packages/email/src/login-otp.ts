import { Body, Container, Head, Heading, Hr, Html, Preview, Text } from "@react-email/components";
import { h } from "./h.ts";
import type { EmailLocale } from "./order-confirmation.ts";

// No JSX — see order-confirmation.ts's top comment (DECISIONS.md ADR-031).
// No link/URL at all, unlike EmailVerificationEmail/PasswordResetEmail — the
// code itself is the whole payload, so this template needs no
// STOREFRONT_BASE_URL dependency (NotificationsService.sendLoginOtpEmail).
export interface LoginOtpEmailProps {
  locale: EmailLocale;
  code: string;
}

const COPY = {
  "sv-SE": {
    preview: (code: string) => `Din inloggningskod: ${code}`,
    heading: "Din inloggningskod",
    intro: "Använd koden nedan för att logga in på Âme de Fil.",
    expiry: "Koden slutar gälla om 10 minuter och kan bara användas en gång.",
    ignore: "Om du inte försökte logga in kan du bortse från det här mejlet.",
  },
  en: {
    preview: (code: string) => `Your sign-in code: ${code}`,
    heading: "Your sign-in code",
    intro: "Use the code below to sign in to Âme de Fil.",
    expiry: "This code expires in 10 minutes and can only be used once.",
    ignore: "If you didn't try to sign in, you can safely ignore this email.",
  },
} as const;

// A wide letter-spaced monospace block is the one deliberate visual
// departure from the other templates' plain Text — the code is the entire
// point of this email and needs to read unambiguously at a glance (no
// similar-looking character confusion), unlike a sentence of prose.
const CODE_STYLE = {
  fontFamily: "monospace",
  fontSize: "32px",
  fontWeight: "bold",
  letterSpacing: "8px",
  textAlign: "center" as const,
  margin: "24px 0",
};

export function LoginOtpEmail(props: LoginOtpEmailProps) {
  const t = COPY[props.locale];

  return h(
    Html,
    { lang: props.locale },
    h(Head, null),
    h(Preview, null, t.preview(props.code)),
    h(
      Body,
      { style: { fontFamily: "sans-serif", backgroundColor: "#f6f6f4" } },
      h(
        Container,
        { style: { backgroundColor: "#ffffff", padding: "32px" } },
        h(Heading, { as: "h1" }, t.heading),
        h(Text, null, t.intro),
        h(Text, { style: CODE_STYLE }, props.code),
        h(Text, null, t.expiry),
        h(Hr, null),
        h(Text, null, t.ignore),
      ),
    ),
  );
}
