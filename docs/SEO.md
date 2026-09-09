# SEO Architecture — Âme de Fil

## 1. Rendering strategy

Product, category, and collection pages are Server Components rendered on the server (SSR/RSC via Next.js 16) — fully-formed HTML on first response, no client-side-only rendering for indexable content. Cart/checkout (not indexable, `noindex`) can lean more client-heavy.

## 2. URL structure

Locale-prefixed, localized path segments (not just a locale prefix on identical paths) so each market gets genuinely native URLs:

```
/sv/produkter/{slug}          # sv-SE (default/fallback locale)
/en/products/{slug}           # en (Sweden-only market, UI/content locale only — not a separate market)
/sv/kollektioner/{slug}
/sv/kategorier/{slug}
```

Slugs are per-`ProductTranslation` (`DATABASE.md` §2) — an English-reading visitor sees an English slug, not a transliterated Swedish one. Canonical URLs are self-referencing per locale, with `hreflang` alternates linking the `sv-SE`/`en` variants of the same product (see §3). (`fr-FR` removed entirely — ADR-021.)

## 3. Internationalization SEO

- `hreflang` alternate links (including `x-default` → `sv-SE`) emitted via the Next.js Metadata API on every localized page.
- `sitemap.xml` generated per locale (or one sitemap with locale-alternate entries), regenerated on catalog change, submitted to Search Console/equivalent per market.
- `next-intl`'s locale routing (ADR-007) drives middleware-level locale detection/negotiation, with an explicit switcher (not solely `Accept-Language` auto-redirect, which can trap users on the wrong locale with no visible way out).

## 4. Structured data (JSON-LD)

Emitted server-side (not injected client-side, so crawlers relying on raw HTML still see it):

- `Product` + nested `Offer` (price, currency, availability — **mirrors live server state**, e.g. `InStock`/`OutOfStock`/`PreOrder` for made-to-order, never a stale cached value) on every product page.
- `BreadcrumbList` on category/collection/product pages.
- `Organization` (+ `sameAs` social links) sitewide.
- `AggregateRating`/`Review` on product pages once reviews ship (Phase 6) — omitted entirely (not faked with zero reviews) until real review data exists, per Google's structured-data guidelines.

## 5. Metadata

Per-page `generateMetadata` (Next.js Metadata API) driven by `ProductTranslation`/`CategoryTranslation` content — title, description, Open Graph image (product hero shot), Twitter Card. No default/boilerplate meta descriptions — every product/category has an editorially-considered one, consistent with the brand's editorial positioning.

## 6. Images

`next/image` throughout: automatic AVIF/WebP negotiation, responsive `sizes`, explicit width/height (no CLS from image loading), priority-loading the hero/above-fold image only. Source storage provider is an open question (`DEPLOYMENT.md`) but must support on-the-fly or pre-generated responsive variants either way.

## 7. Performance (Core Web Vitals)

Targets (checked in CI, not just aspirational): LCP < 2.5s, INP < 200ms, CLS < 0.1 on product/category pages under realistic network conditions (throttled mobile in Lighthouse CI). RSC + selective hydration keeps client JS minimal on read-heavy pages; `motion`/interactive components are the main client-JS budget item and are used deliberately, not everywhere (`DESIGN_SYSTEM.md` §5).

## 8. Robots & crawl control

`robots.txt` disallows `/checkout`, `/cart`, `/account`, `/admin` (separate app, but belt-and-suspenders), and any internal search-result/filter-parameter URLs that would otherwise create infinite crawlable combinations — canonical tags on filtered category views point back to the unfiltered category URL.
