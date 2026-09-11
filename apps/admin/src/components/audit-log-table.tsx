import { useTranslations } from "next-intl";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, Text } from "@ame-de-fil/ui";

export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditLogTableProps {
  entries: AuditLogEntry[];
  locale: string;
}

function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

// before/after are genuinely free-form per action (AuditService.record's
// callers each pass a different shape — order status changes, inventory
// deltas, checkout-sweep counts) — rendered as raw compact JSON rather than
// a bespoke per-action renderer, which would need updating every time a new
// audited action is added elsewhere in the codebase.
function DiffPreview({ before, after, noneLabel }: { before: unknown; after: unknown; noneLabel: string }) {
  if (before === null && after === null) return <span className="text-neutral-600">{noneLabel}</span>;
  return (
    <pre className="max-w-xs overflow-x-auto font-mono text-xs whitespace-pre-wrap text-neutral-700">
      {before !== null ? `- ${JSON.stringify(before)}\n` : ""}
      {after !== null ? `+ ${JSON.stringify(after)}` : ""}
    </pre>
  );
}

// Read-only, no row link (no per-entry detail page — the full record is
// already shown inline) — desktop table only densifies at md+; mobile gets
// stacked, non-interactive records like InventoryTable's own no-detail-page
// precedent, not OrdersTable/CustomersTable's row-link pattern.
export function AuditLogTable({ entries, locale }: AuditLogTableProps) {
  const t = useTranslations("Administration.auditLog");

  return (
    <>
      <Table className="hidden lg:table">
        <TableHead>
          <TableRow>
            <TableHeaderCell>{t("columnAction")}</TableHeaderCell>
            <TableHeaderCell>{t("columnEntity")}</TableHeaderCell>
            <TableHeaderCell>{t("columnChange")}</TableHeaderCell>
            <TableHeaderCell>{t("columnActor")}</TableHeaderCell>
            <TableHeaderCell>{t("columnIp")}</TableHeaderCell>
            <TableHeaderCell>{t("columnDate")}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="font-medium text-neutral-900">{entry.action}</TableCell>
              <TableCell className="text-neutral-600">
                {entry.entityType}
                <div className="text-xs">{entry.entityId}</div>
              </TableCell>
              <TableCell>
                <DiffPreview before={entry.before} after={entry.after} noneLabel={t("none")} />
              </TableCell>
              <TableCell>{entry.actorEmail ?? t("systemActor")}</TableCell>
              <TableCell className="text-neutral-600">{entry.ipAddress ?? t("none")}</TableCell>
              <TableCell>{formatDateTime(entry.createdAt, locale)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="divide-y divide-neutral-200 lg:hidden">
        {entries.map((entry) => (
          <li key={entry.id} className="px-1 py-4">
            <div className="flex items-center justify-between gap-3">
              <Text className="truncate font-medium text-neutral-900">{entry.action}</Text>
              <Text size="sm" className="text-neutral-600">
                {formatDateTime(entry.createdAt, locale)}
              </Text>
            </div>
            <Text size="sm" className="mt-0.5 text-neutral-600">
              {entry.entityType} · {entry.entityId}
            </Text>
            <Text size="sm" className="mt-1 text-neutral-600">
              {entry.actorEmail ?? t("systemActor")}
              {entry.ipAddress ? ` · ${entry.ipAddress}` : ""}
            </Text>
            <div className="mt-2">
              <DiffPreview before={entry.before} after={entry.after} noneLabel={t("none")} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
