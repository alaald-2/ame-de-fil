import { Injectable, Inject } from "@nestjs/common";
import type { Prisma } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";

// DECISIONS.md ADR-022: carrier deliberately not chosen for v1. Checkout
// depends on this interface, never on ManualShippingProvider directly, so a
// real carrier (PostNord/DHL/Bring) can replace it later — live rates,
// labels, and carrier webhooks are explicitly out of scope until then.
export const SHIPPING_PROVIDER = Symbol("SHIPPING_PROVIDER");

export interface ShippingQuote {
  shippingMethodId: string;
  code: string;
  nameSv: string;
  nameEn: string;
  priceMinor: number;
  currency: "SEK";
  minDeliveryDays: number;
  maxDeliveryDays: number;
}

export interface ShippingProvider {
  // Storefront-facing: what can a customer choose from right now.
  listAvailableMethods(): Promise<ShippingQuote[]>;
  // Checkout-facing: re-read the *same* method transactionally (accepts an
  // explicit Prisma client so it participates in checkout's own
  // transaction — never a second, inconsistent read outside it) and
  // returns null if the method no longer exists or was deactivated since
  // the customer selected it.
  getQuote(tx: Prisma.TransactionClient, shippingMethodId: string): Promise<ShippingQuote | null>;
}

function toQuote(row: {
  id: string;
  code: string;
  nameSv: string;
  nameEn: string;
  priceMinor: number;
  minDeliveryDays: number;
  maxDeliveryDays: number;
}): ShippingQuote {
  return {
    shippingMethodId: row.id,
    code: row.code,
    nameSv: row.nameSv,
    nameEn: row.nameEn,
    priceMinor: row.priceMinor,
    currency: "SEK",
    minDeliveryDays: row.minDeliveryDays,
    maxDeliveryDays: row.maxDeliveryDays,
  };
}

// v1 implementation: a flat fee looked up from the ShippingMethod table,
// entered by an admin — no live carrier rate calculation, no labels, no
// carrier webhooks (ADR-022). Swapping in a real carrier later only means
// providing a different SHIPPING_PROVIDER implementation.
@Injectable()
export class ManualShippingProvider implements ShippingProvider {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listAvailableMethods(): Promise<ShippingQuote[]> {
    const rows = await this.prisma.shippingMethod.findMany({
      where: { isActive: true },
      orderBy: { priceMinor: "asc" },
    });
    return rows.map(toQuote);
  }

  async getQuote(
    tx: Prisma.TransactionClient,
    shippingMethodId: string,
  ): Promise<ShippingQuote | null> {
    const row = await tx.shippingMethod.findUnique({ where: { id: shippingMethodId } });
    if (!row || !row.isActive) return null;
    return toQuote(row);
  }
}
