import { createElement } from "react";
import { render } from "@react-email/render";
import { OrderConfirmationEmail, type OrderConfirmationEmailProps } from "./order-confirmation.ts";
import { ShippingNotificationEmail, type ShippingNotificationEmailProps } from "./shipping-notification.ts";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const SUBJECTS = {
  "sv-SE": {
    orderConfirmation: (orderNumber: string) => `Orderbekräftelse — ${orderNumber}`,
    shippingNotification: (orderNumber: string) => `Din beställning ${orderNumber} har skickats`,
  },
  en: {
    orderConfirmation: (orderNumber: string) => `Order confirmation — ${orderNumber}`,
    shippingNotification: (orderNumber: string) => `Your order ${orderNumber} has shipped`,
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
