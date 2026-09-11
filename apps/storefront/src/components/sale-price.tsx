import { useTranslations } from "next-intl";
import { Text, Badge, VisuallyHidden } from "@ame-de-fil/ui";
import { formatMoney } from "../lib/format-money";

interface SalePriceProps {
  price: { amountMinor: number };
  originalPrice: { amountMinor: number } | null;
  promotion: { percentage: number } | null;
  locale: "sv-SE" | "en";
  size?: "sm" | "base";
}

// Shared by product-card.tsx (listing) and the product detail page — same
// visual unit, same "server already decided the price" trust boundary
// (product.mapper.ts's ProductVariantResponse.price is always the
// effective, already-discounted price; originalPrice/promotion are only
// ever non-null when product.mapper.ts found a currently-effective
// promotion). Nothing here recomputes a discount client-side.
export function SalePrice({ price, originalPrice, promotion, locale, size = "sm" }: SalePriceProps) {
  const t = useTranslations("Shop");

  if (!originalPrice || !promotion) {
    return (
      <Text size={size} tone="muted">
        {formatMoney(price.amountMinor, locale)}
      </Text>
    );
  }

  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <Text size={size} className="text-danger">
        {formatMoney(price.amountMinor, locale)}
      </Text>
      <Text size={size} tone="muted" className="line-through">
        <VisuallyHidden>{t("originalPriceLabel")}</VisuallyHidden>
        {formatMoney(originalPrice.amountMinor, locale)}
      </Text>
      <Badge tone="danger">{t("percentOff", { percentage: promotion.percentage })}</Badge>
    </div>
  );
}
