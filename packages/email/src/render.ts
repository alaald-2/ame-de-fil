import { createElement } from "react";
import { render } from "@react-email/render";
import { OrderConfirmationEmail, type OrderConfirmationEmailProps } from "./order-confirmation.ts";
import { ShippingNotificationEmail, type ShippingNotificationEmailProps } from "./shipping-notification.ts";
import { EmailVerificationEmail, type EmailVerificationEmailProps } from "./email-verification.ts";
import { PasswordResetEmail, type PasswordResetEmailProps } from "./password-reset.ts";
import { LoginOtpEmail, type LoginOtpEmailProps } from "./login-otp.ts";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const SUBJECTS = {
  "sv-SE": {
    orderConfirmation: (orderNumber: string) => `Orderbekräftelse — ${orderNumber}`,
    shippingNotification: (orderNumber: string) => `Din beställning ${orderNumber} har skickats`,
    emailVerification: () => "Bekräfta din e-postadress hos Âme de Fil",
    passwordReset: () => "Återställ ditt lösenord hos Âme de Fil",
    // The code itself in the subject line, same as most real OTP senders —
    // it's the one email type where inbox-preview glanceability without
    // opening the message is worth more than a generic subject.
    loginOtp: (code: string) => `${code} är din inloggningskod till Âme de Fil`,
  },
  en: {
    orderConfirmation: (orderNumber: string) => `Order confirmation — ${orderNumber}`,
    shippingNotification: (orderNumber: string) => `Your order ${orderNumber} has shipped`,
    emailVerification: () => "Confirm your email address for Âme de Fil",
    passwordReset: () => "Reset your password for Âme de Fil",
    loginOtp: (code: string) => `${code} is your Âme de Fil sign-in code`,
  },
} as const;

export async function renderOrderConfirmationEmail(props: OrderConfirmationEmailProps): Promise<RenderedEmail> {
  const element = createElement(OrderConfirmationEmail, props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: SUBJECTS[props.locale].orderConfirmation(props.orderNumber), html, text };
}

export async function renderShippingNotificationEmail(
  props: ShippingNotificationEmailProps,
): Promise<RenderedEmail> {
  const element = createElement(ShippingNotificationEmail, props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: SUBJECTS[props.locale].shippingNotification(props.orderNumber), html, text };
}

export async function renderEmailVerificationEmail(props: EmailVerificationEmailProps): Promise<RenderedEmail> {
  const element = createElement(EmailVerificationEmail, props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: SUBJECTS[props.locale].emailVerification(), html, text };
}

export async function renderPasswordResetEmail(props: PasswordResetEmailProps): Promise<RenderedEmail> {
  const element = createElement(PasswordResetEmail, props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: SUBJECTS[props.locale].passwordReset(), html, text };
}

export async function renderLoginOtpEmail(props: LoginOtpEmailProps): Promise<RenderedEmail> {
  const element = createElement(LoginOtpEmail, props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: SUBJECTS[props.locale].loginOtp(props.code), html, text };
}
