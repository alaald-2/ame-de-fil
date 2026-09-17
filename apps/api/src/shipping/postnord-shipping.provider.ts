import { Injectable, Inject, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@ame-de-fil/database";
import type { Env } from "@ame-de-fil/config";
import { PrismaService } from "../database/prisma.service.ts";
import type {
  ShippingProvider,
  ShippingQuote,
  ShipmentDestination,
  ParcelInfo,
  PickupPoint,
  CreatedShipment,
} from "./shipping-provider.ts";

// DECISIONS.md ADR-040. A direct PostNord integration — bypasses Shipmondo
// entirely, unlike ShipmondoShippingProvider: Shipmondo has no pooled
// agreement for PostNord SE domestic, and PostNord isn't on Shipmondo's own-
// agreement carrier list either (ADR-037's 2026-09-17 updates). v1 supports
// exactly one product, Mypack Collect (basicServiceCode "19", pickup-point
// delivery only) — a future product (Mypack Home, Parcel) is one more
// constant/seeded ShippingMethod row, not a rearchitecture.
const SHIPPING_METHOD_CODE = "POSTNORD_MYPACK_COLLECT";
// PostNord Customer API Guides' own service-code list (Pre-Shipment/Booking
// > Transit Time Calculation's documented codes): 19 = Mypack Collect.
const BASIC_SERVICE_CODE = "19";
// "A7 = Optional Service Point" — confirmed directly in PostNord's Service
// Points V5 page's own additional-service-code list. This is the only
// additional-service code documented anywhere for a customer-chosen pickup
// point on basicServiceCode 19. PostNord's Delivery Options API separately
// distinguishes "service-point" from "parcel-locker" as two different
// delivery-option types, but neither its spec nor the Booking API's spec
// documents a *different* additional-service code for a locker booking —
// both are treated as one path here (A7 + whichever servicePointId was
// chosen). This is an inference from combining two specs, not a stated fact
// in either one. Confirm directly with PostNord support before this is
// load-bearing in production (mirrors ADR-037's own "flagged, not yet
// decided" precedent for the Bring/PostNord-via-Shipmondo gap).
const OPTIONAL_SERVICE_POINT_CODE = "A7";
// PostNord Sweden's own issuer code — documented directly in the Booking
// API's consignor.issuerCode field description ("Z12 = PostNord Sweden"),
// not a guess. Hardcoded rather than per-request: ADR-021 is Sweden-only
// for both market and shipping, same reasoning SHIPMONDO_SENDER_COUNTRY_CODE
// defaults to "SE" instead of being configurable per call.
const SWEDEN_ISSUER_CODE = "Z12";
// partyIdType values — documented in the Booking API's own field
// description text (no `enum` key in the schema, but these are quoted
// directly from that description, not guessed): "160 = Customer number,
// 167 = VAT customer number, 156 = Service point ID in deliveryParty,
// 229 = Geographic location".
const PARTY_ID_TYPE_CUSTOMER_NUMBER = "160";
const PARTY_ID_TYPE_SERVICE_POINT = "156";
// The booking response's urls[].type field has no documented enum, but
// "TRACKING" is the spec's own example value for this exact field (unlike
// ids[].idType below, whose example — "itemId" — doesn't even describe our
// use case). Treated as a documented-example default, not a blind guess;
// still worth confirming against a real sandbox booking.
const TRACKING_URL_TYPE = "TRACKING";

interface PostNordServicePoint {
  servicePointId: string;
  name: string;
  visitingAddress?: {
    streetName?: string;
    streetNumber?: string;
    postalCode?: string;
    city?: string;
  };
}

interface PostNordServicePointsResponse {
  servicePointInformationResponse?: {
    servicePoints?: PostNordServicePoint[];
  };
}

interface PostNordBookingResponseId {
  idType: string;
  value: string;
}

interface PostNordBookingResponseUrl {
  type: string;
  url: string;
}

interface PostNordBookingResponseItem {
  status: "OK" | "FAIL";
  ids?: PostNordBookingResponseId[];
  urls?: PostNordBookingResponseUrl[];
  errorResponse?: { message?: string };
}

interface PostNordBookingResponse {
  bookingId: string;
  idInformation?: PostNordBookingResponseItem[];
}

@Injectable()
export class PostNordShippingProvider implements ShippingProvider {
  private readonly logger = new Logger(PostNordShippingProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly customerKey: string;
  private readonly customerNumber: string;
  // Isolated, unconfirmed PostNord values (DECISIONS.md ADR-040) — no
  // default. Neither gates this provider's activation (see the constructor
  // below): withholding the whole integration over one undocumented
  // parameter would be a worse failure mode than a disclosed partial gap in
  // just the feature that needs it.
  private readonly servicePointsReturnType: string | undefined;
  private readonly trackingIdType: string | undefined;
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
    const apiKey = this.config.get("POSTNORD_API_KEY", { infer: true });
    const baseUrl = this.config.get("POSTNORD_BASE_URL", { infer: true });
    const customerKey = this.config.get("POSTNORD_CUSTOMER_KEY", { infer: true });
    const customerNumber = this.config.get("POSTNORD_CUSTOMER_NUMBER", { infer: true });
    const address1 = this.config.get("POSTNORD_SENDER_ADDRESS1", { infer: true });
    const zipcode = this.config.get("POSTNORD_SENDER_ZIPCODE", { infer: true });
    const city = this.config.get("POSTNORD_SENDER_CITY", { infer: true });
    const countryCode = this.config.get("POSTNORD_SENDER_COUNTRY_CODE", { infer: true });
    const name = this.config.get("POSTNORD_SENDER_NAME", { infer: true });
    if (!apiKey || !baseUrl || !customerKey || !customerNumber || !address1 || !zipcode || !city) {
      // ShippingModule's factory is the only intended caller path and
      // already gates on all of these — a defensive second check, mirroring
      // ShipmondoShippingProvider's own constructor.
      throw new Error(
        "PostNordShippingProvider requires POSTNORD_API_KEY/BASE_URL/CUSTOMER_KEY/CUSTOMER_NUMBER/SENDER_ADDRESS1/SENDER_ZIPCODE/SENDER_CITY",
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.customerKey = customerKey;
    this.customerNumber = customerNumber;
    this.servicePointsReturnType = this.config.get("POSTNORD_SERVICE_POINTS_RETURN_TYPE", {
      infer: true,
    });
    this.trackingIdType = this.config.get("POSTNORD_TRACKING_ID_TYPE", { infer: true });
    this.sender = { name, address1, zipcode, city, countryCode };
  }

  // No live pricing endpoint exists anywhere in PostNord's public API
  // (confirmed by inspecting every documented endpoint's request/response
  // schema for a price/amount/cost field — none exists). Priced identically
  // to ManualShippingProvider: the seeded ShippingMethod row's own
  // priceMinor, never a live carrier call.
  async listAvailableMethods(): Promise<ShippingQuote[]> {
    const method = await this.prisma.shippingMethod.findFirst({
      where: { code: SHIPPING_METHOD_CODE, isActive: true },
    });
    return method ? [toShippingQuote(method)] : [];
  }

  async getQuote(
    tx: Prisma.TransactionClient,
    shippingMethodId: string,
  ): Promise<ShippingQuote | null> {
    const method = await tx.shippingMethod.findUnique({ where: { id: shippingMethodId } });
    if (!method || !method.isActive || method.code !== SHIPPING_METHOD_CODE) return null;
    return toShippingQuote(method);
  }

  async listPickupPoints(_shippingMethodId: string, postalCode: string): Promise<PickupPoint[]> {
    const points = await this.fetchServicePoints(postalCode);
    return points.map(toPickupPoint);
  }

  async getPickupPoint(
    _tx: Prisma.TransactionClient,
    _shippingMethodId: string,
    pickupPointId: string,
    postalCode: string,
  ): Promise<PickupPoint | null> {
    const points = await this.fetchServicePoints(postalCode);
    const match = points.find((point) => point.servicePointId === pickupPointId);
    return match ? toPickupPoint(match) : null;
  }

  // Admin-fulfillment-facing (DECISIONS.md ADR-039's pattern) — books a
  // real Mypack Collect shipment via the labels-inline endpoint (one fewer
  // call than a separate booking + label-fetch round trip) and returns its
  // carrier/tracking info. Returns null only when shippingMethodId isn't
  // this provider's own product — AdminOrdersService's manual fallback
  // covers that. `reference` (the order number) is intentionally unused:
  // the Booking API's own party-level `reference` sub-object needs a
  // referenceType value that, like returnType/idType, has no documented
  // enum anywhere in the spec — rather than guess one, correlation is kept
  // purely via the real bookingId this call returns as providerShipmentId
  // (mirrors Payment.providerPaymentIntentId's existing pattern).
  async createShipment(
    shippingMethodId: string,
    destination: ShipmentDestination,
    parcel: ParcelInfo,
    _reference: string,
  ): Promise<CreatedShipment | null> {
    const method = await this.prisma.shippingMethod.findUnique({ where: { id: shippingMethodId } });
    if (!method || method.code !== SHIPPING_METHOD_CODE) return null;
    if (!destination.pickupPointId) {
      // Mypack Collect always requires one (requiresPickupPoint: true on
      // the seeded row) — checkout/markShipped's own flow should never
      // reach here without it, but this provider never sends a booking
      // request with no delivery-party identification.
      throw new Error(
        `PostNordShippingProvider.createShipment called for a Mypack Collect order with no pickupPointId`,
      );
    }

    const body = {
      messageDate: new Date().toISOString(),
      updateIndicator: "Original",
      shipment: [
        {
          service: {
            basicServiceCode: BASIC_SERVICE_CODE,
            additionalServiceCode: [OPTIONAL_SERVICE_POINT_CODE],
          },
          parties: {
            consignor: {
              issuerCode: SWEDEN_ISSUER_CODE,
              partyIdentification: {
                partyId: this.customerNumber,
                partyIdType: PARTY_ID_TYPE_CUSTOMER_NUMBER,
              },
              party: {
                nameIdentification: { name: this.sender.name },
                address: {
                  streets: [this.sender.address1],
                  postalCode: this.sender.zipcode,
                  city: this.sender.city,
                  countryCode: this.sender.countryCode,
                },
              },
            },
            deliveryParty: {
              partyIdentification: {
                partyId: destination.pickupPointId,
                partyIdType: PARTY_ID_TYPE_SERVICE_POINT,
              },
              party: {
                nameIdentification: { name: destination.name },
                address: {
                  streets: [destination.line1, destination.line2].filter(Boolean),
                  postalCode: destination.postalCode,
                  city: destination.city,
                  countryCode: destination.country,
                },
              },
            },
          },
          // numberOfPackages/totalGrossWeight's exact nesting under
          // shipment[] (and totalGrossWeight's unit — grams here, matching
          // this project's own ParcelInfo, vs. a possible kg expectation)
          // is medium-confidence: derived from an earlier, less rigorous
          // documentation pass than the rest of this request body, and not
          // independently re-verified against the raw OpenAPI/Swagger spec.
          // Confirm against a real sandbox booking before this is
          // load-bearing in production.
          numberOfPackages: 1,
          totalGrossWeight: parcel.weightGrams,
        },
      ],
    };

    const response = await fetch(`${this.baseUrl}/rest/shipment/v3/edi/labels/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: this.apiKey, ...body }),
    });
    if (!response.ok) {
      throw new Error(`PostNord booking failed for order with status ${response.status}`);
    }

    const booking = (await response.json()) as PostNordBookingResponse;
    const item = booking.idInformation?.[0];
    if (!item || item.status !== "OK") {
      throw new Error(
        `PostNord booking did not succeed: ${item?.errorResponse?.message ?? "no error detail in response"}`,
      );
    }

    const trackingId = this.trackingIdType
      ? item.ids?.find((id) => id.idType === this.trackingIdType)
      : undefined;
    if (!this.trackingIdType) {
      this.logger.warn(
        "PostNord booking succeeded but POSTNORD_TRACKING_ID_TYPE is not set — trackingNumber left null",
      );
    }
    const trackingUrl = item.urls?.find((url) => url.type === TRACKING_URL_TYPE)?.url ?? null;

    return {
      carrierName: "PostNord",
      trackingNumber: trackingId?.value ?? null,
      trackingUrl,
      providerShipmentId: booking.bookingId,
    };
  }

  private async fetchServicePoints(postalCode: string): Promise<PostNordServicePoint[]> {
    if (!this.servicePointsReturnType) {
      // Isolated, unconfirmed value (see constructor comment) — no
      // documented valid returnType exists anywhere in PostNord's Service
      // Points V5 spec, so this degrades to an honestly-empty result rather
      // than sending a guessed value that could 4xx or silently misbehave
      // against the real sandbox.
      this.logger.warn(
        "PostNord service point lookup skipped: POSTNORD_SERVICE_POINTS_RETURN_TYPE is not set",
      );
      return [];
    }

    const url = new URL(`${this.baseUrl}/rest/businesslocation/v5/servicepoints/nearest/byaddress`);
    url.searchParams.set("apikey", this.apiKey);
    url.searchParams.set("countryCode", "SE");
    url.searchParams.set("customerKey", this.customerKey);
    url.searchParams.set("postalCode", postalCode);
    url.searchParams.set("returnType", this.servicePointsReturnType);
    url.searchParams.set("numberOfServicePoints", "5");

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`PostNord service point lookup failed with status ${response.status}`);
    }
    const body = (await response.json()) as PostNordServicePointsResponse;
    return body.servicePointInformationResponse?.servicePoints ?? [];
  }
}

function toShippingQuote(method: {
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
    shippingMethodId: method.id,
    code: method.code,
    nameSv: method.nameSv,
    nameEn: method.nameEn,
    priceMinor: method.priceMinor,
    currency: "SEK",
    minDeliveryDays: method.minDeliveryDays,
    maxDeliveryDays: method.maxDeliveryDays,
    requiresPickupPoint: method.requiresPickupPoint,
  };
}

function toPickupPoint(point: PostNordServicePoint): PickupPoint {
  const address = point.visitingAddress ?? {};
  const streetLine = [address.streetName, address.streetNumber].filter(Boolean).join(" ");
  return {
    id: point.servicePointId,
    name: point.name,
    address: streetLine,
    postalCode: address.postalCode ?? "",
    city: address.city ?? "",
  };
}
