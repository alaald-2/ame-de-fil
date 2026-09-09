# Design System — Âme de Fil

## 1. Brand direction

**Scandinavian atelier simplicity.** The reference feeling is a small, serious Nordic maison — think the restraint of a Cos or Toteme lookbook crossed with the tactile warmth of an artisan's studio, not a craft marketplace. Every screen should read as _edited_, not filled.

_(The original brief paired this with a French-atelier influence; per your 2026-09-08 confirmation that French is removed entirely from the project, this is narrowed to Scandinavian-only. The underlying adjectives — elegant, editorial, warm, artisanal, premium, minimal, sophisticated, timeless — are unchanged.)_

**Do:** generous whitespace, one confident accent color, editorial photography treated as the hero (not thumbnails in a grid of identical cards), quiet typographic hierarchy, restrained motion that clarifies (not decorates).

**Don't** (direct from the brief, treated as hard constraints): gradients, heavy card/shadow treatments, childish craft-store styling, decorative animation, generic templated SaaS layouts.

## 2. Typography

Two-family pairing, both loadable via Google Fonts (allowed CDN) or self-hosted:

- **Display/editorial serif** — for headlines, product names, editorial story copy. A refined, slightly high-contrast serif in the spirit of Fraunces or Canela — evokes print/atelier rather than screen-native. Used large, with tight-but-legible line-height, never bolded-and-shouty.
- **Body/UI sans** — a neutral, humanist grotesk (Inter or a similar contemporary grotesk) for prices, buttons, form fields, navigation. Chosen specifically for excellent number-set legibility (prices, quantities) and correct rendering of Swedish characters (å, ä, ö) — a narrower glyph requirement than the original 3-locale scope, since `fr-FR` (and its wider accent set) is no longer in scope.

Type scale is a deliberate, small set of steps (not an unbounded utility scale) defined once as design tokens — avoids the "every component picks its own font-size" drift that makes AI-generated UI look inconsistent.

## 3. Color

A **warm, muted neutral palette** (think unbleached linen, stone, warm charcoal) with a **single restrained accent** (a deep, considered tone — terracotta, ink, or a muted forest — final pick is a product/brand decision, not an engineering one) used sparingly for calls-to-action and state, never as a dominant UI color. No gradients. Dark mode is **not** a v1 requirement for the storefront (a premium editorial brand generally commits to one considered palette rather than an auto-inverted theme) — confirm as a product decision if desired later.

## 4. Layout & spacing

- Spacing scale on a consistent base unit (e.g. 4px), used generously — the brief explicitly wants "generous whitespace."
- Grid: content-width constrained (not full-bleed except for hero imagery), asymmetric/editorial layouts on collection/story pages rather than uniform product-grid-everywhere.
- Product grids exist (they're commerce-functional) but are typography- and photography-led, not card-led: minimal or no border/shadow, image as the primary signal, price/name as quiet text beneath — not boxed.

## 5. Component philosophy (shadcn/ui as a starting point, not an endpoint)

shadcn/ui components are copied into `packages/ui` specifically so every default can be overridden (ADR-005). Concretely, at implementation time:

- Reduce default border-radius across the board (shadcn defaults toward rounded-2xl-everywhere, which reads as generic SaaS).
- Remove/minimize default drop-shadows; rely on spacing and a hairline border (or nothing) for separation instead.
- Buttons: restrained, mostly text/outline treatments with the accent color reserved for primary commerce actions (Add to Cart, Checkout, Pay) — not sprinkled across every interactive element.
- Motion (`motion`/ADR-006): page transitions and micro-feedback only (e.g. add-to-cart confirmation, image cross-fade) — no scroll-jacking, no decorative parallax, always respects `prefers-reduced-motion`.

## 6. Product photography treatment

Product imagery is the primary brand signal for a handmade goods brand — the design system defers to photography rather than competing with it: minimal chrome around images, consistent aspect ratios per context (product card vs. hero vs. detail gallery), `next/image` for automatic AVIF/WebP + responsive sizing (`SEO.md` §4).

## 7. Accessibility target: WCAG 2.2 AA

Concrete, testable commitments (not aspirational):

- Color contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text/UI components — checked against the final palette before it's locked in, since a muted/warm palette can easily fail contrast if not checked deliberately.
- Every interactive element has a visible focus state (not suppressed for aesthetics — a common premium-site mistake).
- All motion respects `prefers-reduced-motion: reduce`.
- Forms (checkout especially) have programmatically associated labels, inline error messaging tied via `aria-describedby`, and are fully keyboard-operable.
- Target sizes meet WCAG 2.2's minimum (24×24 CSS px) for touch/click targets, including on dense admin UI.
- Verified in CI via automated checks (axe-core through Playwright, `TESTING.md`) plus manual review before launch — automated tooling catches roughly a third of real issues, so it's a floor, not the whole verification.

## 8. Admin UI

Admin (`apps/admin`) shares design tokens and base components with the storefront for consistency and shared maintenance, but is **information-dense by default** where the storefront is spacious — this is a deliberate, context-driven divergence (an inventory table needs density; a product hero page needs air), not an inconsistency.
