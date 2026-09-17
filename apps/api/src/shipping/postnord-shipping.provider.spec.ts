import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@ame-de-fil/database";
import type { Env } from "@ame-de-fil/config";
import { PostNordShippingProvider } from "./postnord-shipping.provider.ts";
import type { PrismaService } from "../database/prisma.service.ts";

const METHOD_ROW = {
  id: "method-1",
  code: "POSTNORD_MYPACK_COLLECT",
  nameSv: "PostNord Mypack Collect",
  nameEn: "PostNord Mypack Collect",
  priceMinor: 5900,
  minDeliveryDays: 1,
  maxDeliveryDays: 3,
  isActive: true,
  requiresPickupPoint: true,
};

const PARCEL = { weightGrams: 1000, lengthMm: 300, widthMm: 200, heightMm: 150 };

const SHIPMENT_DESTINATION = {
  postalCode: "411 36",
  country: "SE",
  city: "Göteborg",
  name: "Test Testsson",
  line1: "Avenyn 1",
  pickupPointId: "sp-123",
};

function makeConfigMock(overrides: Partial<Env> = {}): ConfigService<Env, true> {
  const values: Partial<Env> = {
    POSTNORD_API_KEY: "key",
    POSTNORD_BASE_URL: "https://atapi2.postnord.com",
    POSTNORD_CUSTOMER_KEY: "customer-key",
    POSTNORD_CUSTOMER_NUMBER: "12345678",
    POSTNORD_SENDER_ADDRESS1: "Segevångsgatan 5B",
    POSTNORD_SENDER_ZIPCODE: "212 27",
    POSTNORD_SENDER_CITY: "Malmö",
    POSTNORD_SENDER_COUNTRY_CODE: "SE",
    POSTNORD_SENDER_NAME: "Âme de Fil",
    // Deliberately unset by default in these tests too — both are isolated,
    // unconfirmed values (DECISIONS.md ADR-040); tests that need one set it
    // explicitly via overrides.
    POSTNORD_SERVICE_POINTS_RETURN_TYPE: undefined,
    POSTNORD_TRACKING_ID_TYPE: undefined,
    ...overrides,
  };
  return { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;
}

function makePrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    shippingMethod: {
      findFirst: vi.fn().mockResolvedValue(METHOD_ROW),
      findUnique: vi.fn().mockResolvedValue(METHOD_ROW),
    },
    ...overrides,
  } as unknown as PrismaService;
}

describe("PostNordShippingProvider constructor", () => {
  it("throws when any required config value is missing", () => {
    const config = makeConfigMock({ POSTNORD_CUSTOMER_NUMBER: undefined });
    expect(() => new PostNordShippingProvider(config, makePrismaMock())).toThrow(
      /requires POSTNORD_API_KEY/,
    );
  });

  it("does not require POSTNORD_SERVICE_POINTS_RETURN_TYPE or POSTNORD_TRACKING_ID_TYPE to construct", () => {
    const config = makeConfigMock();
    expect(() => new PostNordShippingProvider(config, makePrismaMock())).not.toThrow();
  });
});

describe("PostNordShippingProvider.listAvailableMethods / getQuote", () => {
  it("prices from the seeded ShippingMethod row — no live call, no pricing API exists", async () => {
    const prisma = makePrismaMock();
    const provider = new PostNordShippingProvider(makeConfigMock(), prisma);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const quotes = await provider.listAvailableMethods();

    expect(quotes).toEqual([
      {
        shippingMethodId: "method-1",
        code: "POSTNORD_MYPACK_COLLECT",
        nameSv: "PostNord Mypack Collect",
        nameEn: "PostNord Mypack Collect",
        priceMinor: 5900,
        currency: "SEK",
        minDeliveryDays: 1,
        maxDeliveryDays: 3,
        requiresPickupPoint: true,
      },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("returns [] when no active POSTNORD_MYPACK_COLLECT row is seeded", async () => {
    const prisma = makePrismaMock({
      shippingMethod: { findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn() },
    });
    const provider = new PostNordShippingProvider(makeConfigMock(), prisma);

    expect(await provider.listAvailableMethods()).toEqual([]);
  });

  it("getQuote returns null for a ShippingMethod row this provider doesn't recognize", async () => {
    const provider = new PostNordShippingProvider(makeConfigMock(), makePrismaMock());
    const tx = {
      shippingMethod: { findUnique: vi.fn().mockResolvedValue({ ...METHOD_ROW, code: "STANDARD" }) },
    } as unknown as Prisma.TransactionClient;

    expect(await provider.getQuote(tx, "method-1")).toBeNull();
  });

  it("getQuote re-reads through the given transaction client — not this.prisma", async () => {
    const prisma = makePrismaMock();
    const provider = new PostNordShippingProvider(makeConfigMock(), prisma);
    const txFindUnique = vi.fn().mockResolvedValue(METHOD_ROW);
    const tx = { shippingMethod: { findUnique: txFindUnique } } as unknown as Prisma.TransactionClient;

    const quote = await provider.getQuote(tx, "method-1");

    expect(quote?.priceMinor).toBe(5900);
    expect(txFindUnique).toHaveBeenCalledWith({ where: { id: "method-1" } });
    expect(prisma.shippingMethod.findUnique).not.toHaveBeenCalled();
  });
});

describe("PostNordShippingProvider pickup points — POSTNORD_SERVICE_POINTS_RETURN_TYPE isolation", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("listPickupPoints returns [] with no external call when returnType is unset — never a guessed value", async () => {
    const provider = new PostNordShippingProvider(makeConfigMock(), makePrismaMock());

    expect(await provider.listPickupPoints("method-1", "11122")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("getPickupPoint returns null with no external call when returnType is unset", async () => {
    const provider = new PostNordShippingProvider(makeConfigMock(), makePrismaMock());

    expect(
      await provider.getPickupPoint({} as Prisma.TransactionClient, "method-1", "sp-1", "11122"),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls Service Points V5 once returnType is configured, mapping the response to PickupPoint", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        servicePointInformationResponse: {
          servicePoints: [
            {
              servicePointId: "sp-123",
              name: "ICA Nära Storgatan",
              visitingAddress: { streetName: "Storgatan", streetNumber: "1", postalCode: "11122", city: "Stockholm" },
            },
          ],
        },
      }),
    });
    const provider = new PostNordShippingProvider(
      makeConfigMock({ POSTNORD_SERVICE_POINTS_RETURN_TYPE: "matrix" }),
      makePrismaMock(),
    );

    const points = await provider.listPickupPoints("method-1", "11122");

    expect(points).toEqual([
      { id: "sp-123", name: "ICA Nära Storgatan", address: "Storgatan 1", postalCode: "11122", city: "Stockholm" },
    ]);
    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.toString()).toContain("/rest/businesslocation/v5/servicepoints/nearest/byaddress");
    expect(url.searchParams.get("returnType")).toBe("matrix");
    expect(url.searchParams.get("countryCode")).toBe("SE");
    expect(url.searchParams.get("customerKey")).toBe("customer-key");
    expect(url.searchParams.get("postalCode")).toBe("11122");
  });

  it("getPickupPoint returns null when the id doesn't match any returned service point", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ servicePointInformationResponse: { servicePoints: [] } }),
    });
    const provider = new PostNordShippingProvider(
      makeConfigMock({ POSTNORD_SERVICE_POINTS_RETURN_TYPE: "matrix" }),
      makePrismaMock(),
    );

    expect(
      await provider.getPickupPoint({} as Prisma.TransactionClient, "method-1", "sp-1", "11122"),
    ).toBeNull();
  });

  it("throws on a non-ok Service Points response — a real integration failure", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const provider = new PostNordShippingProvider(
      makeConfigMock({ POSTNORD_SERVICE_POINTS_RETURN_TYPE: "matrix" }),
      makePrismaMock(),
    );

    await expect(provider.listPickupPoints("method-1", "11122")).rejects.toThrow(/status 500/);
  });
});

describe("PostNordShippingProvider.createShipment", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("returns null for a ShippingMethod row this provider doesn't recognize", async () => {
    const prisma = makePrismaMock({
      shippingMethod: { findUnique: vi.fn().mockResolvedValue({ ...METHOD_ROW, code: "STANDARD" }) },
    });
    const provider = new PostNordShippingProvider(makeConfigMock(), prisma);

    const result = await provider.createShipment("method-1", SHIPMENT_DESTINATION, PARCEL, "AF-TEST-1");

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null for a nonexistent ShippingMethod row", async () => {
    const prisma = makePrismaMock({
      shippingMethod: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const provider = new PostNordShippingProvider(makeConfigMock(), prisma);

    const result = await provider.createShipment("missing", SHIPMENT_DESTINATION, PARCEL, "AF-TEST-1");

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when called with no pickupPointId — Mypack Collect always requires one", async () => {
    const provider = new PostNordShippingProvider(makeConfigMock(), makePrismaMock());
    const destinationWithoutPickupPoint = { ...SHIPMENT_DESTINATION, pickupPointId: undefined };

    await expect(
      provider.createShipment("method-1", destinationWithoutPickupPoint, PARCEL, "AF-TEST-1"),
    ).rejects.toThrow(/no pickupPointId/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("books a real shipment, using the documented A7/156/160/Z12 values and the correct endpoint", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        bookingId: "booking-1",
        idInformation: [
          {
            status: "OK",
            ids: [{ idType: "itemId", value: "00373500454541020957" }],
            urls: [{ type: "TRACKING", url: "https://tracking.postnord.com/x" }],
          },
        ],
      }),
    });
    const provider = new PostNordShippingProvider(
      makeConfigMock({ POSTNORD_TRACKING_ID_TYPE: "itemId" }),
      makePrismaMock(),
    );

    const result = await provider.createShipment("method-1", SHIPMENT_DESTINATION, PARCEL, "AF-TEST-1");

    expect(result).toEqual({
      carrierName: "PostNord",
      trackingNumber: "00373500454541020957",
      trackingUrl: "https://tracking.postnord.com/x",
      providerShipmentId: "booking-1",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://atapi2.postnord.com/rest/shipment/v3/edi/labels/pdf");
    const body = JSON.parse(init.body as string);
    expect(body.apikey).toBe("key");
    expect(body.shipment[0]).toMatchObject({
      service: { basicServiceCode: "19", additionalServiceCode: ["A7"] },
      numberOfPackages: 1,
      totalGrossWeight: 1000,
    });
    expect(body.shipment[0].parties.consignor).toMatchObject({
      issuerCode: "Z12",
      partyIdentification: { partyId: "12345678", partyIdType: "160" },
      party: {
        nameIdentification: { name: "Âme de Fil" },
        address: { streets: ["Segevångsgatan 5B"], postalCode: "212 27", city: "Malmö", countryCode: "SE" },
      },
    });
    expect(body.shipment[0].parties.deliveryParty).toMatchObject({
      partyIdentification: { partyId: "sp-123", partyIdType: "156" },
      party: {
        nameIdentification: { name: "Test Testsson" },
        address: { streets: ["Avenyn 1"], postalCode: "411 36", city: "Göteborg", countryCode: "SE" },
      },
    });
  });

  it("leaves trackingNumber null when POSTNORD_TRACKING_ID_TYPE is unset — never a guessed idType", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        bookingId: "booking-1",
        idInformation: [
          {
            status: "OK",
            ids: [{ idType: "itemId", value: "00373500454541020957" }],
            urls: [{ type: "TRACKING", url: "https://tracking.postnord.com/x" }],
          },
        ],
      }),
    });
    const provider = new PostNordShippingProvider(makeConfigMock(), makePrismaMock());

    const result = await provider.createShipment("method-1", SHIPMENT_DESTINATION, PARCEL, "AF-TEST-1");

    expect(result).toEqual({
      carrierName: "PostNord",
      trackingNumber: null,
      trackingUrl: "https://tracking.postnord.com/x",
      providerShipmentId: "booking-1",
    });
  });

  it("throws (never falls back silently) when the live call fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const provider = new PostNordShippingProvider(makeConfigMock(), makePrismaMock());

    await expect(
      provider.createShipment("method-1", SHIPMENT_DESTINATION, PARCEL, "AF-TEST-1"),
    ).rejects.toThrow(/status 500/);
  });

  it("throws when the booking response itself reports failure", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        bookingId: "booking-1",
        idInformation: [{ status: "FAIL", errorResponse: { message: "Invalid service point" } }],
      }),
    });
    const provider = new PostNordShippingProvider(makeConfigMock(), makePrismaMock());

    await expect(
      provider.createShipment("method-1", SHIPMENT_DESTINATION, PARCEL, "AF-TEST-1"),
    ).rejects.toThrow(/Invalid service point/);
  });
});
