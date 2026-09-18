import { Injectable, Inject, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@ame-de-fil/database";
import type { Env } from "@ame-de-fil/config";
import { PrismaService } from "../database/prisma.service.ts";
import type {
  ShippingProvider,
  ShippingQuote,
  ShippingDestination,
  ShipmentDestination,
  ParcelInfo,
  PickupPoint,
  CreatedShipment,
} from "./shipping-provider.ts";

// DECISIONS.md ADR-037 + its 2026-09-17 updates. One entry per Shipmondo
// product this store actually quotes — deliberately a short, hand-picked
// list, not every product Shipmondo's API exposes. Each shippingMethodCode
// must match a seeded ShippingMethod.code (prisma/seed.ts) so
// Order.shippingMethodId's FK always has a real row to point at; that row's
// priceMinor/nameSv/nameEn are ManualShippingProvider's fallback display
// values (dev/test without Shipmondo configured) — this provider always
// uses the live Shipmondo price, never the DB one, and re-derives it again
// in getQuote() rather than trusting the value it quoted moments earlier.
//
// Only DHLFSE_P is listed. PostNord and Bring were live-tested against the
// sandbox and confirmed blocked for Swedish domestic shipping on this
// account — both fail with "... is only available through own agreements."
// Add a carrier/product here only once its shipmondo_agreement_available
// flag is confirmed true for SE->SE (GET /setups/carriers' downloadable
// file) or a real own-agreement contract is in place — check
// `available_customer_numbers` on GET /products isn't empty first, or the
// call will 422 the same way.
interface ShipmondoProductConfig {
  shippingMethodCode: string;
  productCode: string;
  // Shipmondo's own valid package_type code for this product/route — not
  // universal across products (confirmed via GET /package_types).
  packageType: string;
  requiresPickupPoint: boolean;
  // Human-readable carrier name for the Shipment record's carrierName
  // column — Shipmondo's own shipment response only gives back
  // carrier_code ("dhl_freight_se"), not a display name, and this project
  // already knows a friendlier one (matches the seeded ShippingMethod's own
  // nameEn "DHL Freight – Parcel"), so there's no need to parse/map the code.
  carrierName: string;
}

const SUPPORTED_PRODUCTS: readonly ShipmondoProductConfig[] = [
  {
    shippingMethodCode: "SHIPMONDO_DHLFSE_P",
    productCode: "DHLFSE_P",
    packageType: "PK",
    requiresPickupPoint: false,
    carrierName: "DHL Freight",
  },
];

// Sweden only (ADR-021) — every configured product above is SE->SE; this
// provider doesn't attempt any other destination country.
const SUPPORTED_DESTINATION_COUNTRY = "SE";

// Applied when a caller has no real parcel dimensions (checkout-cart.ts's
// computeParcelInfo omits them unless every cart line has real
// lengthMm/widthMm/heightMm, which no admin UI lets anyone set today — see
// its own comment). A small generic box, not a measured figure.
// Millimetres, matching ProductVariant's own columns.
export const DEFAULT_PARCEL_DIMENSIONS_MM = {
  lengthMm: 300,
  widthMm: 200,
  heightMm: 150,
};

interface ShipmondoQuoteResponse {
  price: number;
}

// Shipmondo's documented error shape for a 4xx (confirmed live: 422 with
// "Not possible to calculate price. ... (<reason>)").
interface ShipmondoErrorResponse {
  error: string;
}

// Only the fields actually used — the real response (confirmed live against
// the sandbox) has many more (parties, service_point, pick_up, bill_to,
// pallet_exchange, ...), all irrelevant here. No tracking_url field exists
// anywhere in Shipmondo's API — pkg_no ("Carrier's shipment number") is the
// only tracking identifier it returns.
interface ShipmondoShipmentResponse {
  id: number;
  pkg_no: string | null;
}

@Injectable()
export class ShipmondoShippingProvider implements ShippingProvider {
  private readonly logger = new Logger(ShipmondoShippingProvider.name);
  private readonly authHeader: string;
  private readonly baseUrl: string;
  private readonly sender: {
    name: string;
    address1: string;
    zipcode: string;
    city: string;
    countryCode: string;
  };

  constructor(
    private readonly config: ConfigService<Env, true>,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    const apiUser = this.config.get("SHIPMONDO_API_USER", { infer: true });
    const apiKey = this.config.get("SHIPMONDO_API_KEY", { infer: true });
    const baseUrl = this.config.get("SHIPMONDO_BASE_URL", { infer: true });
    const address1 = this.config.get("SHIPMONDO_SENDER_ADDRESS1", { infer: true });
    const zipcode = this.config.get("SHIPMONDO_SENDER_ZIPCODE", { infer: true });
    const city = this.config.get("SHIPMONDO_SENDER_CITY", { infer: true });
    const countryCode = this.config.get("SHIPMONDO_SENDER_COUNTRY_CODE", { infer: true });
    const name = this.config.get("SHIPMONDO_SENDER_NAME", { infer: true });
    if (!apiUser || !apiKey || !baseUrl || !address1 || !zipcode || !city) {
      // ShippingModule's factory is the only intended caller path and
      // already gates on all of these — a defensive second check, mirroring
      // StripePaymentProvider's constructor. SHIPMONDO_SENDER_NAME isn't
      // checked here — it always has a default (env.ts), never unset.
      throw new Error(
        "ShipmondoShippingProvider requires SHIPMONDO_API_USER/API_KEY/BASE_URL/SENDER_ADDRESS1/SENDER_ZIPCODE/SENDER_CITY",
      );
    }
    this.authHeader = `Basic ${Buffer.from(`${apiUser}:${apiKey}`).toString("base64")}`;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.sender = { name, address1, zipcode, city, countryCode };
  }

  async listAvailableMethods(
    destination?: ShippingDestination,
    parcel?: ParcelInfo,
  ): Promise<ShippingQuote[]> {
    if (!this.canQuote(destination, parcel)) return [];

    const methods = await this.prisma.shippingMethod.findMany({
      where: { isActive: true, code: { in: SUPPORTED_PRODUCTS.map((p) => p.shippingMethodCode) } },
    });
    const methodByCode = new Map(methods.map((method) => [method.code, method]));

    const quotes: ShippingQuote[] = [];
    for (const product of SUPPORTED_PRODUCTS) {
      const method = methodByCode.get(product.shippingMethodCode);
      if (!method) continue; // not seeded yet, or deactivated by an admin

      const priceMinor = await this.fetchQuotePriceMinor(product, destination!, parcel!);
      if (priceMinor === null) continue; // Shipmondo couldn't price this route/parcel — skip, don't fail the whole list
      quotes.push(toShippingQuote(method, product, priceMinor));
    }
    return quotes;
  }

  async getQuote(
    tx: Prisma.TransactionClient,
    shippingMethodId: string,
    destination?: ShippingDestination,
    parcel?: ParcelInfo,
  ): Promise<ShippingQuote | null> {
    const method = await tx.shippingMethod.findUnique({ where: { id: shippingMethodId } });
    if (!method || !method.isActive) return null;

    const product = SUPPORTED_PRODUCTS.find((p) => p.shippingMethodCode === method.code);
    if (!product) return null; // this row isn't a Shipmondo product this provider knows about

    if (!this.canQuote(destination, parcel)) return null;

    const priceMinor = await this.fetchQuotePriceMinor(product, destination!, parcel!);
    if (priceMinor === null) return null;
    return toShippingQuote(method, product, priceMinor);
  }

  // No configured product currently requires a pickup point (DHLFSE_P's
  // service_point_required is false, confirmed against the sandbox's own
  // GET /products) — an honestly-empty result, not a stub standing in for
  // unbuilt functionality. A future service-point product would wire these
  // against GET /service_point/service_points instead.
  async listPickupPoints(_shippingMethodId: string, _postalCode: string): Promise<PickupPoint[]> {
    return [];
  }

  async getPickupPoint(
    _tx: Prisma.TransactionClient,
    _shippingMethodId: string,
    _pickupPointId: string,
    _postalCode: string,
  ): Promise<PickupPoint | null> {
    return null;
  }

  // Admin-fulfillment-facing (AdminOrdersService.markShipped, DECISIONS.md
  // ADR-039) — books a real shipment at Shipmondo's own agreement
  // (own_agreement: false, matching this provider's only viable path today
  // — ADR-037's 2026-09-17 update) and returns its carrier/tracking
  // number. Returns null (not a thrown error) only when shippingMethodId
  // isn't one of SUPPORTED_PRODUCTS — AdminOrdersService's own manual
  // fallback covers that. Any live-call failure past that point throws:
  // unlike a quote (where "can't price this" is an expected, silent
  // per-product outcome), a shipment that was supposed to be creatable but
  // wasn't needs to surface as a real error, not a quietly-empty result.
  async createShipment(
    shippingMethodId: string,
    destination: ShipmentDestination,
    parcel: ParcelInfo,
    reference: string,
  ): Promise<CreatedShipment | null> {
    const method = await this.prisma.shippingMethod.findUnique({ where: { id: shippingMethodId } });
    if (!method) return null;
    const product = SUPPORTED_PRODUCTS.find((p) => p.shippingMethodCode === method.code);
    if (!product) return null;

    const body = {
      own_agreement: false,
      product_code: product.productCode,
      service_codes: "",
      reference,
      parties: [
        {
          type: "sender",
          name: this.sender.name,
          address1: this.sender.address1,
          postal_code: this.sender.zipcode,
          city: this.sender.city,
          country_code: this.sender.countryCode,
        },
        {
          type: "receiver",
          name: destination.name,
          address1: destination.line1,
          address2: destination.line2,
          postal_code: destination.postalCode,
          city: destination.city,
          country_code: destination.country,
          phone: destination.phone,
        },
      ],
      parcels: [
        {
          quantity: 1,
          weight: parcel.weightGrams,
          length: mmToCm(parcel.lengthMm ?? DEFAULT_PARCEL_DIMENSIONS_MM.lengthMm),
          width: mmToCm(parcel.widthMm ?? DEFAULT_PARCEL_DIMENSIONS_MM.widthMm),
          height: mmToCm(parcel.heightMm ?? DEFAULT_PARCEL_DIMENSIONS_MM.heightMm),
          packaging: product.packageType,
        },
      ],
    };

    const response = await fetch(`${this.baseUrl}/shipments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: this.authHeader },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as ShipmondoErrorResponse | null;
      throw new Error(
        `Shipmondo shipment creation failed for ${product.productCode} with status ${response.status}: ${errorBody?.error ?? "no error body"}`,
      );
    }

    const shipment = (await response.json()) as ShipmondoShipmentResponse;
    return {
      carrierName: product.carrierName,
      trackingNumber: shipment.pkg_no,
      // No such field exists in Shipmondo's response (confirmed live) —
      // never fabricated from a guessed carrier-tracking-page URL pattern.
      trackingUrl: null,
      providerShipmentId: String(shipment.id),
    };
  }

  private canQuote(
    destination: ShippingDestination | undefined,
    parcel: ParcelInfo | undefined,
  ): destination is ShippingDestination & { city: string } {
    return (
      destination !== undefined &&
      parcel !== undefined &&
      destination.country === SUPPORTED_DESTINATION_COUNTRY &&
      Boolean(destination.city)
    );
  }

  private async fetchQuotePriceMinor(
    product: ShipmondoProductConfig,
    destination: ShippingDestination & { city: string },
    parcel: ParcelInfo,
  ): Promise<number | null> {
    const body = {
      product_code: product.productCode,
      sender: {
        address1: this.sender.address1,
        zipcode: this.sender.zipcode,
        city: this.sender.city,
        country_code: this.sender.countryCode,
      },
      receiver: {
        address1: this.sender.address1, // street-level detail doesn't affect this product's price; zip+city (which do) are always the real destination
        zipcode: destination.postalCode,
        city: destination.city,
        country_code: destination.country,
      },
      parcels: [
        {
          quantity: 1,
          weight: parcel.weightGrams,
          // Shipmondo's parcel dimensions are centimetres; this project's
          // schema stores millimetres (ProductVariant.lengthMm etc.) —
          // converted here, at the one place that needs Shipmondo's unit.
          length: mmToCm(parcel.lengthMm ?? DEFAULT_PARCEL_DIMENSIONS_MM.lengthMm),
          width: mmToCm(parcel.widthMm ?? DEFAULT_PARCEL_DIMENSIONS_MM.widthMm),
          height: mmToCm(parcel.heightMm ?? DEFAULT_PARCEL_DIMENSIONS_MM.heightMm),
          packaging: product.packageType,
        },
      ],
    };

    const response = await fetch(`${this.baseUrl}/quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: this.authHeader },
      body: JSON.stringify(body),
    });

    if (response.status === 422) {
      // Not quotable for this destination/parcel (no agreement, upstream
      // carrier validation failure, out of range, ...) — a real, expected
      // outcome per product/route, not a bug. Logged so a pattern of
      // 422s is visible, but never thrown: the caller treats "no quote"
      // the same as "this product wasn't offered."
      const errorBody = (await response.json().catch(() => null)) as ShipmondoErrorResponse | null;
      this.logger.warn(
        `Shipmondo quote unavailable for ${product.productCode}: ${errorBody?.error ?? "422 with no error body"}`,
      );
      return null;
    }
    if (!response.ok) {
      throw new Error(`Shipmondo quote request failed with status ${response.status}`);
    }

    const quote = (await response.json()) as ShipmondoQuoteResponse;
    // Shipmondo returns a decimal SEK amount (e.g. 189.52) — this project's
    // money columns are minor units (öre), matching every other price in
    // the schema (ProductVariant.priceMinor etc.).
    return Math.round(quote.price * 100);
  }
}

function mmToCm(mm: number): number {
  return Math.max(1, Math.round(mm / 10));
}

function toShippingQuote(
  method: {
    id: string;
    code: string;
    nameSv: string;
    nameEn: string;
    minDeliveryDays: number;
    maxDeliveryDays: number;
  },
  product: ShipmondoProductConfig,
  priceMinor: number,
): ShippingQuote {
  return {
    shippingMethodId: method.id,
    code: method.code,
    nameSv: method.nameSv,
    nameEn: method.nameEn,
    priceMinor,
    currency: "SEK",
    minDeliveryDays: method.minDeliveryDays,
    maxDeliveryDays: method.maxDeliveryDays,
    requiresPickupPoint: product.requiresPickupPoint,
  };
}
