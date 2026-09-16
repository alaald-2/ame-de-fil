import { Injectable, Inject } from "@nestjs/common";
import type { Prisma } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";

// DECISIONS.md ADR-022/ADR-037: carrier chosen for v1 is Shipmondo, scoped
// to PostNord/DHL/Bring — but checkout depends on this interface, never on
// a concrete implementation, so ManualShippingProvider stays the dev/test
// default and a ShipmondoShippingProvider (or any later carrier) can be
// swapped in via the SHIPPING_PROVIDER binding without touching checkout,
// Order, or any other consumer.
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
  // Mirrors the generic "service_point_product" concept every real
  // carrier/aggregator exposes (ADR-037) — true means checkout must collect
  // a chosen pickup point (ombud/paketbox) before this method is valid.
  requiresPickupPoint: boolean;
}

// Sweden-only (ADR-021) — postalCode/country are accepted now so a real
// provider can filter/price by destination; ManualShippingProvider ignores
// them (flat rate, one country), but the shape is ready for Shipmondo.
export interface ShippingDestination {
  postalCode: string;
  country: string;
}

export interface ParcelInfo {
  weightGrams: number;
}

// Provider-agnostic pickup point shape (ADR-037) — never a live FK to a
// carrier's own directory; a chosen one is snapshotted onto Order at
// checkout time (pickupPointId/pickupPointName/pickupPointAddress).
export interface PickupPoint {
  id: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
}

export interface ShippingProvider {
  // Storefront-facing: what can a customer choose from right now.
  // destination/parcel are optional so a flat-rate provider (Manual) can
  // ignore them entirely; a real carrier is expected to use them to filter
  // and price results.
  listAvailableMethods(
    destination?: ShippingDestination,
    parcel?: ParcelInfo,
  ): Promise<ShippingQuote[]>;
  // Checkout-facing: re-read the *same* method transactionally (accepts an
  // explicit Prisma client so it participates in checkout's own
  // transaction — never a second, inconsistent read outside it) and
  // returns null if the method no longer exists or was deactivated since
  // the customer selected it.
  getQuote(tx: Prisma.TransactionClient, shippingMethodId: string): Promise<ShippingQuote | null>;
  // Storefront-facing: pickup points near postalCode for a method whose
  // requiresPickupPoint is true. Empty array (not an error) for a method
  // that doesn't require one, or with no coverage at that postal code.
  listPickupPoints(shippingMethodId: string, postalCode: string): Promise<PickupPoint[]>;
  // Checkout-facing mirror of getQuote: re-verify the customer's chosen
  // pickup point still exists for this method/postal code, transactionally.
  // postalCode is required here (not stored server-side between requests)
  // so a provider can re-derive/re-verify the same result deterministically.
  getPickupPoint(
    tx: Prisma.TransactionClient,
    shippingMethodId: string,
    pickupPointId: string,
    postalCode: string,
  ): Promise<PickupPoint | null>;
}

function toQuote(row: {
  id: string;
  code: string;
  nameSv: string;
  nameEn: string;
  priceMinor: number;
  minDeliveryDays: number;
  maxDeliveryDays: number;
  requiresPickupPoint: boolean;
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
    requiresPickupPoint: row.requiresPickupPoint,
  };
}

// Deterministic, fixture-only pickup points — never a real carrier lookup
// (ADR-037: ManualShippingProvider makes no external calls). Generated from
// the postal code alone so listPickupPoints() and getPickupPoint() agree on
// the same two points without persisting anything.
function fixturePickupPoints(shippingMethodId: string, postalCode: string): PickupPoint[] {
  return [
    {
      id: `${shippingMethodId}-pp-1-${postalCode}`,
      name: "Ombud Centrum",
      address: "Storgatan 1",
      postalCode,
      city: "Stockholm",
    },
    {
      id: `${shippingMethodId}-pp-2-${postalCode}`,
      name: "Paketbox Söder",
      address: "Götgatan 44",
      postalCode,
      city: "Stockholm",
    },
  ];
}

// v1 implementation: a flat fee looked up from the ShippingMethod table,
// entered by an admin — no live carrier rate calculation, no labels, no
// carrier webhooks (ADR-022). Pickup points are simulated fixtures, not a
// real carrier lookup — enough to build and test the full checkout flow
// (address -> methods -> pickup points -> selection -> order snapshot)
// before ShipmondoShippingProvider lands (ADR-037). Swapping in a real
// carrier later only means providing a different SHIPPING_PROVIDER
// implementation.
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

  async listPickupPoints(shippingMethodId: string, postalCode: string): Promise<PickupPoint[]> {
    const row = await this.prisma.shippingMethod.findUnique({ where: { id: shippingMethodId } });
    if (!row || !row.isActive || !row.requiresPickupPoint) return [];
    return fixturePickupPoints(shippingMethodId, postalCode);
  }

  async getPickupPoint(
    tx: Prisma.TransactionClient,
    shippingMethodId: string,
    pickupPointId: string,
    postalCode: string,
  ): Promise<PickupPoint | null> {
    const row = await tx.shippingMethod.findUnique({ where: { id: shippingMethodId } });
    if (!row || !row.isActive || !row.requiresPickupPoint) return null;
    return (
      fixturePickupPoints(shippingMethodId, postalCode).find(
        (point) => point.id === pickupPointId,
      ) ?? null
    );
  }
}
