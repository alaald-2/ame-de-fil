import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, getLocale } from "next-intl/server";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display-family",
  display: "swap",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-sans-family", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("title") };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  const t = await getTranslations("Common");
  // Was hardcoded to "sv-SE" regardless of the actual admin_locale cookie
  // (i18n/request.ts) — every page's *content* was already correctly
  // localized, but a screen reader was always told the document is
  // Swedish even while displaying English or Spanish.
  const locale = await getLocale();

  return (
    <html lang={locale} className={`${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-screen font-sans">
        <NextIntlClientProvider messages={messages}>
          <a
            href="#main-content"
            className="sr-only rounded-sm bg-neutral-900 px-4 py-2 text-neutral-50 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
          >
            {t("skipToContent")}
          </a>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
