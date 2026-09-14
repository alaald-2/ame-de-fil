import { useTranslations } from "next-intl";
import type { Product } from "@ame-de-fil/types";
import { Text, PlaceholderImage, cn } from "@ame-de-fil/ui";
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
  const hoverImage = product.images[1];
  // Same precedence as product-variant-selector.tsx's own `firstAvailable`
  // (the product detail page's default selection) — variants have no
  // guaranteed order from the API (no `orderBy` on the relation), so a bare
  // `variants[0]` here could show a sold-out variant's price while the PDP
  // defaults to a different, available variant's price for the same
  // product, a listing-to-detail mismatch on the core browse→buy path.
  const displayVariant = product.variants.find((v) => v.available) ?? product.variants[0];
  const anyAvailable = product.variants.some((v) => v.available);
  const allMadeToOrder = product.variants.every((v) => v.productionTimeDays !== null);

  return (
    <Link
      href={{ pathname: "/products/[slug]", params: { slug: product.slug } }}
      className="group block"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-neutral-100">
        {image ? (
          // Plain <img>, not next/image: next.config.ts's remotePatterns is
          // still empty (image storage vendor deferred — DECISIONS.md
          // ADR-020), so next/image would reject any real remote URL today.
          //
          // Second image (when one exists) is stacked on top, opacity 0 →
          // 100 on hover while the first fades the other way — the same
          // "swap to the second product photo on hover" mechanic as the
          // reference site's Dawn-theme card (its own
          // `.media--hover-effect` CSS, inspected live), just as Tailwind
          // group-hover classes instead of that theme's own stylesheet.
          <img
            src={image.url}
            alt={image.altText ?? ""}
            className={cn(
              "h-full w-full object-cover transition-all duration-500 ease-out-slow group-hover:scale-[1.03]",
              hoverImage && "group-hover:opacity-0",
            )}
          />
        ) : (
          <PlaceholderImage className="h-full w-full" />
        )}
        {hoverImage ? (
          <img
            src={hoverImage.url}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-all duration-500 ease-out-slow group-hover:scale-[1.03] group-hover:opacity-100"
          />
        ) : null}
      </div>
      <div className="mt-3">
        <Text size="sm" className="text-neutral-900">
          {product.name}
        </Text>
        {displayVariant ? (
          <SalePrice
            price={displayVariant.price}
            originalPrice={displayVariant.originalPrice}
            promotion={displayVariant.promotion}
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
