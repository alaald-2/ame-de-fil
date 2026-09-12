import { getTranslations, getLocale } from "next-intl/server";
import { Heading, Text, Pagination, SearchField, EmptyState, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../lib/dal";
import { getServerApiClient } from "../../../lib/server-api";
import { AdministrationTabs } from "../../../components/administration-tabs";
import { AdminUsersTable } from "../../../components/admin-users-table";
import { CreateUserDialog } from "../../../components/create-user-dialog";

const PAGE_SIZE = 20;

interface AdministrationPageProps {
  searchParams: Promise<{ page?: string; q?: string }>;
}

// Real GET /admin/users data (users.view-gated server-side) — the "Users"
// tab of the two-tab Administration section (RBAC/user administration,
// ROADMAP.md's Phase 5 checkpoint); Audit log is the sibling
// /administration/audit-log route, sharing AdministrationTabs.
export default async function AdministrationPage({ searchParams }: AdministrationPageProps) {
  const session = await requireSession();
  const { page: pageParam, q: qParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);
  const q = qParam?.trim() ?? "";

  const t = await getTranslations("Administration");
  const tNav = await getTranslations("Navigation");
  const locale = await getLocale();
  const client = await getServerApiClient();
  const permissions = session.user.permissions;

  const { data, error, response } = await client.GET("/api/v1/admin/users", {
    params: { query: { page, pageSize: PAGE_SIZE, q: q || undefined } },
  });

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
          <ErrorState className="mt-6" title={t("errorTitle")} description={t("errorDescription")} />
        )}
      </div>
    );
  }

  // A user created with zero roles is invisible everywhere in this section
  // afterward: AdminUsersService.list/getDetail are both staff-scoped
  // (`roles: { some: {} }`) by design (they must never duplicate
  // admin-customers' own full-User-table listing), so a roleless new user
  // 404s on its own detail page and never appears in the list — there is
  // no other route back to it, not even by the id the creation response
  // returned. CreateUserDialog therefore requires picking at least one
  // role, which means creation is only offered at all when the actor holds
  // users.manage_roles (to pick from) and at least one role actually
  // passes the "subset of the actor's own permissions" filter below.
  const canManageRoles = permissions.includes("users.manage_roles");
  const assignableRoles =
    permissions.includes("users.manage") && canManageRoles
      ? await (async () => {
          const rolesResult = await client.GET("/api/v1/admin/roles");
          if (rolesResult.error) return [];
          return rolesResult.data
            .filter((role) => role.permissions.every((key) => permissions.includes(key)))
            .map((role) => ({ id: role.id, name: role.name }));
        })()
      : [];
  const canCreateUsers = permissions.includes("users.manage") && assignableRoles.length > 0;

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <Heading level={1}>{tNav("administration")}</Heading>
        <Text tone="muted">{t("usersCount", { count: data.total })}</Text>
      </div>

      <div className="mt-6">
        <AdministrationTabs permissions={permissions} />
      </div>

      <div className="mt-4 max-w-sm">
        <SearchField label={t("searchLabel")} placeholder={t("searchPlaceholder")} />
      </div>

      {canCreateUsers ? (
        <div className="mt-6 flex justify-end">
          <CreateUserDialog assignableRoles={assignableRoles} />
        </div>
      ) : null}

      {data.items.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={q ? t("emptyFilteredTitle") : t("emptyTitle")}
          description={q ? t("emptyFilteredDescription") : t("emptyDescription")}
        />
      ) : (
        <>
          <div className="mt-6">
            <AdminUsersTable users={data.items} locale={locale} />
          </div>
          {totalPages > 1 ? (
            <Pagination
              className="mt-8"
              page={data.page}
              totalPages={totalPages}
              makeHref={(targetPage) =>
                q
                  ? `/administration?page=${targetPage}&q=${encodeURIComponent(q)}`
                  : `/administration?page=${targetPage}`
              }
              previousLabel={t("paginationPrevious")}
              nextLabel={t("paginationNext")}
              pageLabel={(current, total) => t("paginationPage", { page: current, totalPages: total })}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
