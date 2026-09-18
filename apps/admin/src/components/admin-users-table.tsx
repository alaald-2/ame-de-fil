import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  TableRowLink,
  Badge,
  Text,
} from "@ame-de-fil/ui";
import { userStatusTone } from "../lib/user-status";
import { formatDate } from "../lib/format-date";

export interface AdminUserListItem {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  roles: { id: string; name: string }[];
  createdAt: string;
  lastLoginAt: string | null;
}

interface AdminUsersTableProps {
  users: AdminUserListItem[];
  locale: string;
}


function fullName(user: AdminUserListItem): string | null {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
}

function RolesCell({ roles }: { roles: AdminUserListItem["roles"] }) {
  if (roles.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <Badge key={role.id}>{role.name}</Badge>
      ))}
    </div>
  );
}

// Same "whole row/record is a link" pattern as OrdersTable/CustomersTable —
// this is the staff-only list (GET /admin/users, roles: { some: {} }), a
// deliberately different surface from CustomersTable's full-User-table view.
export function AdminUsersTable({ users, locale }: AdminUsersTableProps) {
  const t = useTranslations("Administration");

  return (
    <>
      <Table className="hidden md:table">
        <TableHead>
          <TableRow>
            <TableHeaderCell>{t("columnEmail")}</TableHeaderCell>
            <TableHeaderCell>{t("columnName")}</TableHeaderCell>
            <TableHeaderCell>{t("columnStatus")}</TableHeaderCell>
            <TableHeaderCell>{t("columnRoles")}</TableHeaderCell>
            <TableHeaderCell>{t("columnJoined")}</TableHeaderCell>
            <TableHeaderCell>{t("columnLastActive")}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id} interactive>
              <TableCell className="font-medium text-neutral-900">
                <TableRowLink href={`/administration/users/${user.id}`}>
                  {t("viewUser", { email: user.email })}
                </TableRowLink>
                {user.email}
              </TableCell>
              <TableCell>{fullName(user) ?? t("nameFallback")}</TableCell>
              <TableCell>
                <Badge tone={userStatusTone(user.status)}>
                  {user.status === "ACTIVE" ? t("statusActive") : t("statusDisabled")}
                </Badge>
              </TableCell>
              <TableCell>
                <RolesCell roles={user.roles} />
              </TableCell>
              <TableCell>{formatDate(user.createdAt, locale)}</TableCell>
              <TableCell>
                {user.lastLoginAt ? formatDate(user.lastLoginAt, locale) : t("never")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="divide-y divide-neutral-200 md:hidden">
        {users.map((user) => (
          <li key={user.id}>
            <Link
              href={`/administration/users/${user.id}`}
              className="block rounded-sm px-1 py-4 transition-colors hover:bg-neutral-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500"
            >
              <div className="flex items-center justify-between gap-3">
                <Text className="truncate font-medium text-neutral-900">{user.email}</Text>
                <Badge tone={userStatusTone(user.status)}>
                  {user.status === "ACTIVE" ? t("statusActive") : t("statusDisabled")}
                </Badge>
              </div>
              <Text size="sm" tone="muted" className="mt-0.5">
                {fullName(user) ?? t("nameFallback")}
              </Text>
              <div className="mt-2">
                <RolesCell roles={user.roles} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <Text size="sm" tone="muted">
                    {t("columnJoined")}
                  </Text>
                  <Text size="sm">{formatDate(user.createdAt, locale)}</Text>
                </div>
                <div>
                  <Text size="sm" tone="muted">
                    {t("columnLastActive")}
                  </Text>
                  <Text size="sm">
                    {user.lastLoginAt ? formatDate(user.lastLoginAt, locale) : t("never")}
                  </Text>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
