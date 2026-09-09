import { getTranslations } from "next-intl/server";
import { Heading, Text, Button } from "@ame-de-fil/ui";
import Link from "next/link";

export default async function NotFound() {
  const t = await getTranslations("Errors");

  return (
    <div className="py-16 text-center">
      <Heading level={1}>{t("notFoundTitle")}</Heading>
      <Text tone="muted" className="mx-auto mt-4 max-w-md">
        {t("notFoundBody")}
      </Text>
      <div className="mt-8">
        <Button asChild>
          <Link href="/">{t("notFoundCta")}</Link>
        </Button>
      </div>
    </div>
  );
}
