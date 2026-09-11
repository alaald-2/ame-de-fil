import { useTranslations } from "next-intl";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, Badge, Text } from "@ame-de-fil/ui";
import { AdjustStockDialog } from "./adjust-stock-dialog";

export interface InventoryListItem {
  variantId: string;
  sku: string;
  productName: string;
  onHand: number;
  reserved: number;
  available: boolean;
  availableQuantity: number | null;
  tracksStock: boolean;
  isLimitedEdition: boolean;
  productionTimeDays: number | null;
  lowStockThreshold: number | null;
}

interface InventoryTableProps {
  items: InventoryListItem[];
  canAdjust: boolean;
}

// No detail page exists for a single inventory item (ROADMAP.md's Phase 5
// inventory checkpoints are all read-only lists — no per-item drill-down
// was built), so unlike OrdersTable/CustomersTable this has no row link at
// all: plain cells on desktop, plain (non-anchor) stacked records on
// mobile. The one exception is the "Adjust" action itself (a dialog, not a
// navigation) — see adjust-stock-dialog.tsx for why that was missing
// everywhere until now. Shared by both the overview list and the low-stock
// list — same response shape (InventoryController_list/listLowStock), just
// a different filtered/sorted query.
export function InventoryTable({ items, canAdjust }: InventoryTableProps) {
  const t = useTranslations("Inventory");

  return (
    <>
      <Table className="hidden md:table">
        <TableHead>
          <TableRow>
            <TableHeaderCell>{t("columnProduct")}</TableHeaderCell>
            <TableHeaderCell>{t("columnSku")}</TableHeaderCell>
            <TableHeaderCell className="text-right">{t("columnOnHand")}</TableHeaderCell>
            <TableHeaderCell className="text-right">{t("columnReserved")}</TableHeaderCell>
            <TableHeaderCell>{t("columnAvailable")}</TableHeaderCell>
            <TableHeaderCell className="text-right">{t("columnThreshold")}</TableHeaderCell>
            {canAdjust ? <TableHeaderCell>{t("columnActions")}</TableHeaderCell> : null}
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.variantId}>
              <TableCell className="font-medium text-neutral-900">{item.productName}</TableCell>
              <TableCell className="text-neutral-600">{item.sku}</TableCell>
              <TableCell numeric>{item.tracksStock ? item.onHand : t("notTracked")}</TableCell>
              <TableCell numeric>{item.tracksStock ? item.reserved : t("notTracked")}</TableCell>
              <TableCell>
                <Badge tone={item.available ? "success" : "danger"}>
                  {item.available ? t("available") : t("unavailable")}
                  {item.availableQuantity !== null ? ` (${item.availableQuantity})` : ""}
                </Badge>
              </TableCell>
              <TableCell numeric>{item.lowStockThreshold ?? t("none")}</TableCell>
              {canAdjust ? (
                <TableCell>
                  {item.tracksStock ? (
                    <AdjustStockDialog
                      variantId={item.variantId}
                      productName={item.productName}
                      sku={item.sku}
                      onHand={item.onHand}
                    />
                  ) : null}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="divide-y divide-neutral-200 md:hidden">
        {items.map((item) => (
          <li key={item.variantId} className="px-1 py-4">
            <div className="flex items-center justify-between gap-3">
              <Text className="truncate font-medium text-neutral-900">{item.productName}</Text>
              <Badge tone={item.available ? "success" : "danger"}>
                {item.available ? t("available") : t("unavailable")}
                {item.availableQuantity !== null ? ` (${item.availableQuantity})` : ""}
              </Badge>
            </div>
            <Text size="sm" tone="muted" className="mt-0.5">
              {item.sku}
            </Text>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <Text size="sm" tone="muted">
                  {t("columnOnHand")}
                </Text>
                <Text size="sm" className="tabular-nums">
                  {item.tracksStock ? item.onHand : t("notTracked")}
                </Text>
              </div>
              <div>
                <Text size="sm" tone="muted">
                  {t("columnReserved")}
                </Text>
                <Text size="sm" className="tabular-nums">
                  {item.tracksStock ? item.reserved : t("notTracked")}
                </Text>
              </div>
              <div>
                <Text size="sm" tone="muted">
                  {t("columnThreshold")}
                </Text>
                <Text size="sm" className="tabular-nums">
                  {item.lowStockThreshold ?? t("none")}
                </Text>
              </div>
            </div>
            {canAdjust && item.tracksStock ? (
              <div className="mt-3">
                <AdjustStockDialog
                  variantId={item.variantId}
                  productName={item.productName}
                  sku={item.sku}
                  onHand={item.onHand}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
