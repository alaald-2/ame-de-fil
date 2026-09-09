import { getTranslations } from "next-intl/server";
import { Container, Cluster, Text } from "@ame-de-fil/ui";
import { Link } from "../i18n/navigation";

export async function Footer() {
  const t = await getTranslations("Footer");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-neutral-200 py-10">
      <Container>
        <Cluster align="center" className="justify-between">
          <Text size="sm" tone="muted">
            © {year} Âme de Fil. {t("rights")}
          </Text>
          <Cluster gap="md">
            <Link
              href="/shipping"
              className="rounded-sm font-sans text-sm text-neutral-600 hover:text-neutral-900"
            >
              {t("shipping")}
            </Link>
            <Link
              href="/contact"
              className="rounded-sm font-sans text-sm text-neutral-600 hover:text-neutral-900"
            >
              {t("contact")}
            </Link>
          </Cluster>
        </Cluster>
      </Container>
    </footer>
  );
}
