import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE_NAME } from "./config";

// Admin is an internal tool — no SEO/crawlable-URL need, so locale is a
// cookie preference rather than a URL segment (unlike the storefront's
// next-intl routing/middleware setup). "Shared infrastructure" here means
// the same next-intl library and message-catalog pattern, not identical
// routing — the two apps' locale needs are genuinely different.
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const requested = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const locale = SUPPORTED_LOCALES.includes(requested as (typeof SUPPORTED_LOCALES)[number])
    ? (requested as (typeof SUPPORTED_LOCALES)[number])
    : DEFAULT_LOCALE;

  const messages = (await import(`../../messages/${locale}.json`)) as {
    default: Record<string, unknown>;
  };

  return { locale, messages: messages.default };
});
