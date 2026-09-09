// Pricing model (architectural decision, flagged for review): every
// priceMinor in this codebase — variant prices (already shown as-is to
// customers by the storefront, catalog/mappers/product.mapper.ts) and
// ShippingMethod.priceMinor — is VAT-*inclusive*, matching standard
// Swedish/EU B2C retail practice (the price shown is the price paid).
// taxMinor is therefore the VAT *embedded within* subtotal+shipping, not an
// amount added on top: totalMinor = subtotalMinor + shippingMinor -
// discountMinor, and taxMinor is purely informational (a receipt
// breakdown), exactly like a Swedish kvitto's "varav moms" line.
//
// Embedded VAT for a VAT-inclusive amount at rate r%:
//   vat = amount * r / (100 + r)
export function computeEmbeddedVatMinor(amountMinor: number, ratePercent: number): number {
  return Math.round((amountMinor * ratePercent) / (100 + ratePercent));
}

export interface PricedLine {
  unitPriceMinor: number;
  quantity: number;
  taxRatePercent: number;
  lineSubtotalMinor: number;
  lineTotalMinor: number;
  lineTaxMinor: number;
}

// No per-line discount exists yet (Discounts are explicitly out of scope
// for checkout this checkpoint — Order.discountMinor stays 0), so
// lineTotalMinor always equals lineSubtotalMinor for now; kept as a
// separate field because the Order schema already distinguishes them for
// when a real discount engine lands.
export function priceLine(
  unitPriceMinor: number,
  quantity: number,
  ratePercent: number,
): PricedLine {
  const lineSubtotalMinor = unitPriceMinor * quantity;
  return {
    unitPriceMinor,
    quantity,
    taxRatePercent: ratePercent,
    lineSubtotalMinor,
    lineTotalMinor: lineSubtotalMinor,
    lineTaxMinor: computeEmbeddedVatMinor(lineSubtotalMinor, ratePercent),
  };
}

export interface OrderTotals {
  subtotalMinor: number;
  shippingMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export function computeOrderTotals(
  lines: readonly PricedLine[],
  shippingMinor: number,
  shippingTaxRatePercent: number,
): OrderTotals {
  const subtotalMinor = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  const itemsTaxMinor = lines.reduce((sum, line) => sum + line.lineTaxMinor, 0);
  const shippingTaxMinor = computeEmbeddedVatMinor(shippingMinor, shippingTaxRatePercent);

  return {
    subtotalMinor,
    shippingMinor,
    discountMinor: 0,
    taxMinor: itemsTaxMinor + shippingTaxMinor,
    totalMinor: subtotalMinor + shippingMinor,
  };
}
