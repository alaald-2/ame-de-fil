import { Injectable, Inject } from "@nestjs/common";
import type { Prisma } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";

// DECISIONS.md ADR-022/ADR-037: carrier chosen for v1 is Shipmondo — but
// checkout depends on this interface, never on a concrete implementation,
// so ManualShippingProvider stays the dev/test default and
// ShipmondoShippingProvider is swapped in via the SHIPPING_PROVIDER binding
// (shipping.module.ts) without touching checkout, Order, or any other
// consumer. ADR-037's original PostNord/DHL/Bring carrier scope doesn't
// hold for Sweden as written — PostNord and Bring were live-tested and
// confirmed to have no Shipmondo agreement for Swedish domestic shipping
// (ADR-037's 2026-09-17 update); ShipmondoShippingProvider's own
// SUPPORTED_PRODUCTS list is the current source of truth for which
// products actually work, not this comment.
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
  // Optional because ManualShippingProvider never needed it — but a real
  // carrier's upstream validation can reject a postal code/city mismatch
  // outright (confirmed live: DHL Freight 422'd on "Goteborg"/411 36 until
  // corrected to "Göteborg", DECISIONS.md ADR-037's 2026-09-17 update), so
  // ShipmondoShippingProvider requires it to quote at all.
  city?: string;
}

export interface ParcelInfo {
  weightGrams: number;
  // Bounding-box dimensions in millimetres, mirroring ProductVariant's own
  // lengthMm/widthMm/heightMm columns — optional because those columns have
  // no admin UI to set them yet (unlike weightGrams), so real per-order
  // dimensions are rarely available. A real carrier (Shipmondo) requires
  // *some* dimensions to quote; a caller without real ones falls back to a
  // documented default parcel size rather than omitting them (see
  // shipmondo-shipping.provider.ts's DEFAULT_PARCEL_DIMENSIONS_MM).
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
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

// createShipment's destination — a superset of ShippingDestination:
// city is required here (unlike the base type) because there is always a
// full Order shipping address available by ship time, and a name/street
// line are required by any real carrier to actually deliver a parcel,
// unlike a pre-payment rate quote which only needs postalCode/city/country
// to price a route.
export interface ShipmentDestination extends Omit<ShippingDestination, "city"> {
  city: string;
  name: string;
  line1: string;
  line2?: string;
  phone?: string;
}

// What a real carrier handed back after actually creating a shipment —
// distinct from ShippingQuote, which is a price estimate for a method that
// doesn't exist at the carrier yet. trackingUrl is nullable because
// Shipmondo's API (DECISIONS.md ADR-038/ADR-039) has no such field at all —
// only a carrier tracking number (`pkg_no`); never fabricated here.
export interface CreatedShipment {
  carrierName: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  // The provider's own shipment id — kept for traceability/future ops
  // (e.g. voiding, re-fetching a label) even though nothing reads it back
  // yet. Mirrors Payment.providerPaymentIntentId's existing pattern.
  providerShipmentId: string;
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
  // the customer selected it. destination/parcel are optional for the same
  // reason listAvailableMethods' are (ManualShippingProvider ignores them),
  // but a live carrier provider needs them to re-derive the *same* price
  // it quoted moments earlier rather than trusting a client-echoed one
  // (DECISIONS.md ADR-037's "never trust a stale price" — checkout always
  // has real destination/parcel data available by this point and passes it).
  getQuote(
    tx: Prisma.TransactionClient,
    shippingMethodId: string,
    destination?: ShippingDestination,
    parcel?: ParcelInfo,
  ): Promise<ShippingQuote | null>;
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
  // Admin-fulfillment-facing (not customer-facing, unlike everything else
  // on this interface): attempt to create a real carrier shipment/label for
  // an order already marked ready-to-ship. Returns null when this provider
  // can't — always for ManualShippingProvider (no external carrier at all),
  // or for ShipmondoShippingProvider when shippingMethodId isn't one of its
  // own SUPPORTED_PRODUCTS — AdminOrdersService falls back to its existing
  // free-text carrier/tracking entry in that case. A *thrown* error (rather
  // than null) means the provider should have been able to create one but
  // the live call itself failed — AdminOrdersService surfaces that rather
  // than silently falling back to a fabricated result.
  createShipment(
    shippingMethodId: string,
    destination: ShipmentDestination,
    parcel: ParcelInfo,
    reference: string,
  ): Promise<CreatedShipment | null>;
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

  // No external carrier exists to create anything at (ADR-022) — always
  // null, so AdminOrdersService always falls back to its manual free-text
  // carrier/tracking entry when this is the active provider.
  async createShipment(
    _shippingMethodId: string,
    _destination: ShipmentDestination,
    _parcel: ParcelInfo,
    _reference: string,
  ): Promise<CreatedShipment | null> {
    return null;
  }
}
