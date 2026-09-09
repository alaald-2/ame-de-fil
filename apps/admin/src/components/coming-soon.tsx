import { useTranslations } from "next-intl";
import { Heading, Text } from "@ame-de-fil/ui";

interface ComingSoonProps {
  title: string;
}

// Shared shell for every admin section that has navigation but no
// implemented functionality yet (PRODUCT_SPEC.md §5's full feature set is
// explicitly out of scope for this checkpoint).
export function ComingSoon({ title }: ComingSoonProps) {
  const t = useTranslations("Common");

  return (
    <div>
      <Heading level={1}>{title}</Heading>
      <Text tone="muted" className="mt-2">
        {t("comingSoon")}
      </Text>
    </div>
  );
}
