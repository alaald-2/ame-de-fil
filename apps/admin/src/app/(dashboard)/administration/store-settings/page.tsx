import { getTranslations } from "next-intl/server";
import { Heading, Text, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../../lib/dal";
import { getServerApiClient } from "../../../../lib/server-api";
import { AdministrationTabs } from "../../../../components/administration-tabs";
import { StoreSettingsForm } from "../../../../components/store-settings-form";

// Real GET /admin/store-settings data (settings.view-gated server-side) —
// the third Administration tab, alongside Users/Audit log. Read/write are
// split (settings.view/settings.manage) the same way Users' own
// users.view/users.manage are — a role can view without editing.
export default async function StoreSettingsPage() {
  const session = await requireSession();

  const t = await getTranslations("Administration.storeSettings");
  const tNav = await getTranslations("Navigation");
  const client = await getServerApiClient();
  const permissions = session.user.permissions;

  const { data, error, response } = await client.GET("/api/v1/admin/store-settings");

  if (error) {
    return (
      <div>
        <Heading level={1}>{tNav("administration")}</Heading>
        <div className="mt-6">
          <AdministrationTabs permissions={permissions} />
        </div>
        {response.status === 403 ? (
          <ErrorState
            className="mt-6"
            title={t("forbiddenTitle")}
            description={t("forbiddenDescription")}
          />
        ) : (
          <ErrorState
            className="mt-6"
            title={t("errorTitle")}
            description={t("errorDescription")}
          />
        )}
      </div>
    );
  }

  const canManage = permissions.includes("settings.manage");

  return (
    <div>
      <Heading level={1}>{tNav("administration")}</Heading>

      <div className="mt-6">
        <AdministrationTabs permissions={permissions} />
      </div>

      {canManage ? (
        <StoreSettingsForm settings={data} />
      ) : (
        <Text size="sm" tone="muted" className="mt-6">
          {t("readOnlyNotice")}
        </Text>
      )}
    </div>
  );
}
