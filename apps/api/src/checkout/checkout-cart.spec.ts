import { describe, expect, it } from "vitest";
import { Locale } from "@ame-de-fil/database";
import {
  resolveProductName,
  resolveVariantLabel,
  buildOrderItemSnapshot,
  type CheckoutCartItem,
} from "./checkout-cart.ts";

function makeItem(overrides: Partial<CheckoutCartItem> = {}): CheckoutCartItem {
  return {
    id: "item-1",
    quantity: 2,
    variant: {
      id: "var-1",
      sku: "SKU-1",
      priceMinor: 29900,
      product: {
        translations: [
          { locale: Locale.sv_SE, name: "Halsduk" },
          { locale: Locale.en, name: "Scarf" },
        ],
      },
      optionValues: [
        { option: { key: "color" }, optionValue: { labelSv: "Rost", labelEn: "Rust" } },
        { option: { key: "size" }, optionValue: { labelSv: "M", labelEn: "M" } },
      ],
    },
    ...overrides,
  } as unknown as CheckoutCartItem;
}

describe("resolveProductName", () => {
  it("resolves the requested locale's translation", () => {
    expect(resolveProductName(makeItem(), "sv-SE", "sv-SE")).toBe("Halsduk");
    expect(resolveProductName(makeItem(), "en", "sv-SE")).toBe("Scarf");
  });

  it("falls back to the SKU when neither locale has a translation", () => {
    const item = makeItem({
      variant: {
        ...makeItem().variant,
        product: { translations: [] },
      },
    } as never);
    expect(resolveProductName(item, "sv-SE", "sv-SE")).toBe("SKU-1");
  });
});

describe("resolveVariantLabel", () => {
  it("joins option value labels for the requested locale", () => {
    expect(resolveVariantLabel(makeItem(), "sv-SE")).toBe("Rost / M");
    expect(resolveVariantLabel(makeItem(), "en")).toBe("Rust / M");
  });

  it("falls back to the SKU for a variant with no options", () => {
    const item = makeItem({ variant: { ...makeItem().variant, optionValues: [] } } as never);
    expect(resolveVariantLabel(item, "sv-SE")).toBe("SKU-1");
  });
});

describe("buildOrderItemSnapshot", () => {
  it("combines identity, label, and priced-line fields", () => {
    const snapshot = buildOrderItemSnapshot(makeItem(), "sv-SE", "sv-SE", 25);

    expect(snapshot).toEqual({
      productVariantId: "var-1",
      productNameSnapshot: "Halsduk",
      variantLabelSnapshot: "Rost / M",
      skuSnapshot: "SKU-1",
      unitPriceMinor: 29900,
      quantity: 2,
      taxRatePercent: 25,
      lineSubtotalMinor: 59800,
      lineTotalMinor: 59800,
      lineTaxMinor: 11960,
    });
  });
});
