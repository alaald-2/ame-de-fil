import { useTranslations } from "next-intl";
import type { Product } from "@ame-de-fil/types";
import { Text } from "@ame-de-fil/ui";
import { Link } from "../i18n/navigation";
import { SalePrice } from "./sale-price";

interface ProductCardProps {
  product: Product;
  locale: "sv-SE" | "en";
}

// No "Add to Cart" here — a listing card has no variant selection UI, and
// silently adding an arbitrary first variant for a multi-option product
// (size/color) would be a UX decision this checkpoint doesn't own. The
// product detail page, where a specific variant row is visible, is where
// "Add to Cart" actually lives (see products/[slug]/page.tsx).
export function ProductCard({ product, locale }: ProductCardProps) {
  const t = useTranslations("Shop");
  const image = product.images[0];
  const firstVariant = product.variants[0];
  const anyAvailable = product.variants.some((v) => v.available);
  const allMadeToOrder = product.variants.every((v) => v.productionTimeDays !== null);

  return (
    <Link
      href={{ pathname: "/products/[slug]", params: { slug: product.slug } }}
      className="group block"
    >
      <div className="aspect-[3/4] overflow-hidden bg-neutral-100">
        {image ? (
          // Plain <img>, not next/image: next.config.ts's remotePatterns is
          // still empty (image storage vendor deferred — DECISIONS.md
          // ADR-020), so next/image would reject any real remote URL today.
          <img
            src={image.url}
            alt={image.altText ?? ""}
            className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
          />
        ) : null}
      </div>
      <div className="mt-3">
        <Text size="sm" className="text-neutral-900">
          {product.name}
        </Text>
        {firstVariant ? (
          <SalePrice
            price={firstVariant.price}
            originalPrice={firstVariant.originalPrice}
            promotion={firstVariant.promotion}
            locale={locale}
          />
        ) : null}
        {!anyAvailable ? (
          <Text size="sm" tone="muted">
            {t("soldOut")}
          </Text>
        ) : allMadeToOrder ? (
          <Text size="sm" tone="muted">
            {t("madeToOrder")}
          </Text>
        ) : null}
      </div>
    </Link>
  );
}
