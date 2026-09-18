import { describe, expect, it } from "vitest";
import { renderOrderConfirmationEmail, renderShippingNotificationEmail } from "./render.ts";
import type { OrderConfirmationEmailProps } from "./order-confirmation.ts";
import type { ShippingNotificationEmailProps } from "./shipping-notification.ts";

const ORDER_PROPS: Omit<OrderConfirmationEmailProps, "locale"> = {
  orderNumber: "AF-2026-000123",
  items: [
    {
      name: "Handstickad tröja",
      variantLabel: "M / Blå",
      quantity: 2,
      unitPriceMinor: 49900,
      lineTotalMinor: 99800,
    },
  ],
  subtotalMinor: 99800,
  shippingMinor: 4900,
  discountMinor: 0,
  totalMinor: 104700,
  currency: "SEK",
  shippingAddress: {
    name: "Test Testsson",
    line1: "Testgatan 1",
    postalCode: "11122",
    city: "Stockholm",
    country: "SE",
  },
};

const SHIPPING_PROPS: Omit<ShippingNotificationEmailProps, "locale"> = {
  orderNumber: "AF-2026-000123",
  carrierName: "PostNord",
  trackingNumber: "TRACK-999",
  trackingUrl: "https://tracking.example.com/TRACK-999",
};

// 1047.00 in the formatted currency, regardless of locale grouping style
// (a plain space, a non-breaking space, a period, or a comma).
const TOTAL_PATTERN = /1[\s.,]?047/;

describe("renderOrderConfirmationEmail", () => {
  for (const locale of ["sv-SE", "en"] as const) {
    it(`renders the order number and total in ${locale}`, async () => {
      const result = await renderOrderConfirmationEmail({ ...ORDER_PROPS, locale });

      expect(result.subject).toContain("AF-2026-000123");
      expect(result.html).toContain("AF-2026-000123");
      expect(result.html).toContain("Handstickad tröja");
      expect(result.text).toContain("AF-2026-000123");
      expect(result.html).toMatch(TOTAL_PATTERN);
    });
  }
});

describe("renderShippingNotificationEmail", () => {
  for (const locale of ["sv-SE", "en"] as const) {
    it(`renders the order number and tracking number in ${locale}`, async () => {
      const result = await renderShippingNotificationEmail({ ...SHIPPING_PROPS, locale });

      expect(result.subject).toContain("AF-2026-000123");
      expect(result.html).toContain("AF-2026-000123");
      expect(result.html).toContain("TRACK-999");
      expect(result.text).toContain("TRACK-999");
    });
  }
});
