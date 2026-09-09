import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "../../i18n/routing";
import { Header } from "../../components/header";
import { Footer } from "../../components/footer";
import { CartProvider } from "../../components/cart-provider";
import type { AppLocale } from "../../lib/locale";
import "../globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display-family",
  display: "swap",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-sans-family", display: "swap" });

type LocaleParams = { locale: string };

export function generateStaticParams(): LocaleParams[] {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<LocaleParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: { default: t("title"), template: `%s — ${t("title")}` },
    description: t("description"),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<LocaleParams>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  const messages = await getMessages();
  const t = await getTranslations({ locale, namespace: "Common" });

  return (
    <html lang={locale} className={`${fraunces.variable} ${inter.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <CartProvider locale={locale as AppLocale}>
            <a
              href="#main-content"
              className="sr-only rounded-sm bg-neutral-900 px-4 py-2 text-neutral-50 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
            >
              {t("skipToContent")}
            </a>
            <Header />
            <main id="main-content" className="flex-1">
              {children}
            </main>
            <Footer />
          </CartProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
