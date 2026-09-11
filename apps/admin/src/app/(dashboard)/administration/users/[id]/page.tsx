import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { Heading, Text, Link, Badge, Card, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../../../lib/dal";
import { getServerApiClient } from "../../../../../lib/server-api";
import { userStatusTone } from "../../../../../lib/user-status";
import { UserStatusAction } from "../../../../../components/user-status-action";
import { UserRoleManager } from "../../../../../components/user-role-manager";

interface UserDetailPageProps {
  params: Promise<{ id: string }>;
}

function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

// Real GET /admin/users/:id data — staff-scoped (a non-staff user id 404s
// here exactly as admin-users.service.ts's getDetail does, so this can
// never be used as a side channel to browse arbitrary customer profiles;
// that's admin-customers' own separate customers.view-gated surface).
export default async function UserDetailPage({ params }: UserDetailPageProps) {
  const session = await requireSession();
  const { id } = await params;

  const t = await getTranslations("Administration");
  const td = await getTranslations("Administration.detail");
  const locale = await getLocale();
  const client = await getServerApiClient();
  const permissions = session.user.permissions;

  const { data: user, error, response } = await client.GET("/api/v1/admin/users/{id}", {
    params: { path: { id } },
  });

  if (error) {
    if (response.status === 404) notFound();
    return (
      <ErrorState
        className="mt-6"
        title={response.status === 403 ? t("forbiddenTitle") : td("detailErrorTitle")}
        description={response.status === 403 ? t("forbiddenDescription") : td("detailErrorDescription")}
      />
    );
  }

  // Self-role-changes and self-deactivation are blocked completely
  // server-side (isSelfTarget, admin-users.service.ts) — these controls
  // simply aren't offered here for the signed-in admin's own user, rather
  // than being shown and failing on click.
  const isSelf = session.user.id === user.id;
  const canManageStatus = permissions.includes("users.manage") && !isSelf;
  const canManageRoles = permissions.includes("users.manage_roles") && !isSelf;

  const assignableRoles = canManageRoles
    ? await (async () => {
        const rolesResult = await client.GET("/api/v1/admin/roles");
        if (rolesResult.error) return [];
        const heldRoleIds = new Set(user.roles.map((role) => role.id));
        return rolesResult.data
          .filter(
            (role) => !heldRoleIds.has(role.id) && role.permissions.every((key) => permissions.includes(key)),
          )
          .map((role) => ({ id: role.id, name: role.name }));
      })()
    : [];

  return (
    <div>
      <Link href="/administration" className="text-sm">
        &larr; {td("backToUsers")}
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Heading level={1}>{user.email}</Heading>
          <Badge tone={userStatusTone(user.status)}>
            {user.status === "ACTIVE" ? t("statusActive") : t("statusDisabled")}
          </Badge>
        </div>
        {canManageStatus ? <UserStatusAction userId={user.id} status={user.status} /> : null}
      </div>

      <Text className="mt-1 text-neutral-600">
        {[user.firstName, user.lastName].filter(Boolean).join(" ") || t("nameFallback")}
      </Text>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <Heading level={2} className="mb-3">
            {td("roles")}
          </Heading>
          <UserRoleManager userId={user.id} currentRoles={user.roles} assignableRoles={assignableRoles} />

          <Heading level={2} className="mt-8 mb-3">
            {td("effectivePermissions")}
          </Heading>
          {user.permissions.length === 0 ? (
            <Text size="sm" className="text-neutral-600">
              {td("noPermissions")}
            </Text>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {user.permissions.map((permission) => (
                <li key={permission}>
                  <Badge>{permission}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Card className="h-fit">
          <Heading level={2} className="mb-4">
            {td("accountInfo")}
          </Heading>
          <div className="flex flex-col gap-3">
            <InfoRow label={td("activeSessions")} value={String(user.activeSessionCount)} />
            <InfoRow label={td("created")} value={formatDateTime(user.createdAt, locale)} />
            <InfoRow label={td("updated")} value={formatDateTime(user.updatedAt, locale)} />
            <InfoRow
              label={td("lastLogin")}
              value={user.lastLoginAt ? formatDateTime(user.lastLoginAt, locale) : t("never")}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <Text size="sm" className="text-neutral-600">
        {label}
      </Text>
      <Text size="sm" className="text-right">
        {value}
      </Text>
    </div>
  );
}
