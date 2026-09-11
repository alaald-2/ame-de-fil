import { useTranslations } from "next-intl";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, Text } from "@ame-de-fil/ui";
import { diffAuditPayload, formatJsonValue, humanizeFieldNameFallback, type JsonValue } from "../lib/audit-diff";
import { formatMoney } from "../lib/format-money";
import type { AdminLocale } from "../i18n/config";

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
  locale: AdminLocale;
}

function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

// A translation lookup that never throws and never lets a missing key leak
// into the UI as raw "Namespace.key" text — falls back to the value it
// would otherwise have shown untranslated (still real data, just not
// localized), so an enum value this dictionary doesn't recognize yet
// degrades gracefully instead of breaking the row.
function safeTranslate(t: (key: string) => string, key: string, fallback: string): string {
  try {
    const result = t(key);
    return result && result !== key ? result : fallback;
  } catch {
    return fallback;
  }
}

type Translator = ReturnType<typeof useTranslations>;

interface StatusLabelContext {
  actionPrefix: string;
  tOrderStatus: Translator;
  tPaymentStatus: Translator;
  userStatusActive: string;
  userStatusDisabled: string;
}

function resolveValue(
  key: string,
  raw: JsonValue | undefined,
  locale: AdminLocale,
  ctx: StatusLabelContext,
): string | null {
  const formatted = formatJsonValue(raw);
  if (formatted === null) return null;
  if (key === "amountMinor" && typeof raw === "number") return formatMoney(raw, locale);
  if (key === "paymentStatus" && typeof raw === "string") {
    return safeTranslate((v) => ctx.tPaymentStatus(v), raw, formatted);
  }
  if ((key === "status" || key === "orderStatus") && typeof raw === "string") {
    if (key === "orderStatus" || ctx.actionPrefix === "order") {
      return safeTranslate((v) => ctx.tOrderStatus(v), raw, formatted);
    }
    if (ctx.actionPrefix === "user") {
      if (raw === "ACTIVE") return ctx.userStatusActive;
      if (raw === "DISABLED") return ctx.userStatusDisabled;
    }
  }
  return formatted;
}

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
                <ChangeSummary before={entry.before} after={entry.after} action={entry.action} locale={locale} />
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
              <ChangeSummary before={entry.before} after={entry.after} action={entry.action} locale={locale} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function ChangeSummary({
  before,
  after,
  action,
  locale,
}: {
  before: unknown;
  after: unknown;
  action: string;
  locale: AdminLocale;
}) {
  const t = useTranslations("Administration.auditLog");
  const tFields = useTranslations("Administration.auditLog.fields");
  const tOrderStatus = useTranslations("Orders.status");
  const tPaymentStatus = useTranslations("Orders.paymentStatus");
  const tAdmin = useTranslations("Administration");

  const rows = diffAuditPayload(before, after);
  if (rows.length === 0) {
    return (
      <Text size="sm" tone="muted">
        {t("none")}
      </Text>
    );
  }

  const actionPrefix = action.split(".")[0] ?? "";
  const ctx: StatusLabelContext = {
    actionPrefix,
    tOrderStatus,
    tPaymentStatus,
    userStatusActive: tAdmin("statusActive"),
    userStatusDisabled: tAdmin("statusDisabled"),
  };

  return (
    <ul className="max-w-xs text-sm text-neutral-700">
      {rows.map(({ key, before: beforeValue, after: afterValue }) => {
        const label = safeTranslate((k) => tFields(k), key, humanizeFieldNameFallback(key));
        const beforeLabel = resolveValue(key, beforeValue, locale, ctx);
        const afterLabel = resolveValue(key, afterValue, locale, ctx);

        let content: string;
        if (beforeLabel !== null && afterLabel !== null && beforeLabel !== afterLabel) {
          content = `${label}: ${beforeLabel} → ${afterLabel}`;
        } else if (afterLabel !== null) {
          content = `${label}: ${afterLabel}`;
        } else if (beforeLabel !== null) {
          content = `${label}: ${beforeLabel}`;
        } else {
          return null;
        }

        return <li key={key}>{content}</li>;
      })}
    </ul>
  );
}
