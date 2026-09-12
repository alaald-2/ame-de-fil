import { cn } from "../utils/cn";

export type LogoVariant = "compact" | "full";
export type LogoTone = "dark" | "light";

// Natural aspect ratio of each cropped brand asset
// (public/brand/logo-{variant}-{tone}.png, identical bytes in both apps —
// see apps/*/public/brand's own README-less duplication: Next.js can't
// serve a workspace package's files, so the small PNGs are copied rather
// than symlinked for portability). "compact" is the wordmark + cat emblem
// with the "Atelier Textile" subtitle cropped out (header/sidebar/receipt
// — anywhere too short for the subtitle to stay legible); "full" is the
// uncropped lockup (currently only the admin login page has room for it).
// "light" (white ink) has no caller yet — kept in reserve for a dark
// section that doesn't exist in either app today; see the brand review
// artifact for the full placement rationale.
const ASPECT_RATIO: Record<LogoVariant, number> = {
  compact: 1200 / 424,
  full: 1200 / 568,
};

export interface LogoProps {
  variant?: LogoVariant;
  tone?: LogoTone;
  /** Rendered height in px — width is derived from the source file's own aspect ratio, never passed separately. */
  height: number;
  className?: string;
}

// Plain <img>, not next/image: this codebase has never used next/image
// (product-card.tsx's own comment — next.config.ts's remotePatterns stays
// empty since every real product image is a remote Cloudinary URL), and a
// local /public file gains nothing from it that explicit width/height
// attributes don't already give for free (no layout shift while it loads).
export function Logo({ variant = "compact", tone = "dark", height, className }: LogoProps) {
  const width = Math.round(height * ASPECT_RATIO[variant]);
  return (
    <img
      src={`/brand/logo-${variant}-${tone}.png`}
      alt="Âme de Fil"
      width={width}
      height={height}
      className={cn("block", className)}
    />
  );
}
