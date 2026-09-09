import { Locale as PrismaLocale } from "@ame-de-fil/database";
import type { Locale as AppLocale } from "@ame-de-fil/validation";

// Prisma's generated Locale enum exposes the schema identifier itself as its
// runtime value ("sv_SE"), not the @map'd DB string ("sv-SE") — verified by
// reading the generated client, not assumed. The two locale representations
// must be explicitly bridged; they do not match by accident, and comparing
// them directly is a real bug this file exists to prevent.
const PRISMA_TO_APP: Record<PrismaLocale, AppLocale> = {
  [PrismaLocale.sv_SE]: "sv-SE",
  [PrismaLocale.en]: "en",
};

const APP_TO_PRISMA: Record<AppLocale, PrismaLocale> = {
  "sv-SE": PrismaLocale.sv_SE,
  en: PrismaLocale.en,
};

export function toPrismaLocale(locale: AppLocale): PrismaLocale {
  return APP_TO_PRISMA[locale];
}

export function fromPrismaLocale(locale: PrismaLocale): AppLocale {
  return PRISMA_TO_APP[locale];
}
