import { getTranslations } from "next-intl/server";
import { Container, Heading, Text, Button } from "@ame-de-fil/ui";
import { Link } from "../../i18n/navigation";

// Page shell only — no catalog data yet (explicitly out of scope for this
// checkpoint). Real content replaces this once the catalog module ships.
export default async function HomePage() {
  const t = await getTranslations("Home");

  return (
    <Container className="py-20 text-center">
      <Heading level={1}>{t("heroTitle")}</Heading>
      <Text size="lg" tone="muted" className="mx-auto mt-4 max-w-xl">
        {t("heroSubtitle")}
      </Text>
      <div className="mt-8">
        <Button asChild>
          <Link href="/shop">{t("cta")}</Link>
        </Button>
      </div>
    </Container>
  );
}
