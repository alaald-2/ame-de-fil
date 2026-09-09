import { getTranslations } from "next-intl/server";
import { Container, Heading, Alert, FormField, Input, Button, Stack } from "@ame-de-fil/ui";

// Structural shell only — no real submission wired to apps/api yet
// (product/business logic for login is explicitly out of scope for this
// checkpoint; DECISIONS.md ADR-015 owns the eventual real session-creation flow).
export default async function LoginPage() {
  const t = await getTranslations("Login");

  return (
    <Container className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm">
        <Heading level={2} className="mb-6 text-center">
          {t("title")}
        </Heading>
        <Alert tone="info" className="mb-6">
          {t("notImplemented")}
        </Alert>
        <form>
          <Stack gap="md">
            <FormField label={t("emailLabel")} required>
              {(fieldProps) => (
                <Input type="email" autoComplete="username" disabled {...fieldProps} />
              )}
            </FormField>
            <FormField label={t("passwordLabel")} required>
              {(fieldProps) => (
                <Input type="password" autoComplete="current-password" disabled {...fieldProps} />
              )}
            </FormField>
            <Button type="submit" disabled className="mt-2">
              {t("submit")}
            </Button>
          </Stack>
        </form>
      </div>
    </Container>
  );
}
