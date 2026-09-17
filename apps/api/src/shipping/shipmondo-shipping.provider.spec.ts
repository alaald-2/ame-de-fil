import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@ame-de-fil/database";
import type { Env } from "@ame-de-fil/config";
import { ShipmondoShippingProvider } from "./shipmondo-shipping.provider.ts";
import type { PrismaService } from "../database/prisma.service.ts";

const METHOD_ROW = {
  id: "method-1",
  code: "SHIPMONDO_DHLFSE_P",
  nameSv: "DHL Freight – Paket",
  nameEn: "DHL Freight – Parcel",
  priceMinor: 9900,
  minDeliveryDays: 1,
  maxDeliveryDays: 3,
  isActive: true,
};

const DESTINATION = { postalCode: "411 36", country: "SE", city: "Göteborg" };
const PARCEL = { weightGrams: 1000, lengthMm: 300, widthMm: 200, heightMm: 150 };

function makeConfigMock(overrides: Partial<Env> = {}): ConfigService<Env, true> {
  const values: Partial<Env> = {
    SHIPMONDO_API_USER: "user",
    SHIPMONDO_API_KEY: "key",
    SHIPMONDO_BASE_URL: "https://sandbox.shipmondo.com/api/public/v3",
    SHIPMONDO_SENDER_ADDRESS1: "Drottninggatan 1",
    SHIPMONDO_SENDER_ZIPCODE: "111 51",
    SHIPMONDO_SENDER_CITY: "Stockholm",
    SHIPMONDO_SENDER_COUNTRY_CODE: "SE",
    SHIPMONDO_SENDER_NAME: "Âme de Fil",
    ...overrides,
  };
  return { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;
}

function makePrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    shippingMethod: {
      findMany: vi.fn().mockResolvedValue([METHOD_ROW]),
      findUnique: vi.fn().mockResolvedValue(METHOD_ROW),
    },
    ...overrides,
  } as unknown as PrismaService;
}

describe("ShipmondoShippingProvider constructor", () => {
  it("throws when any required config value is missing", () => {
    const config = makeConfigMock({ SHIPMONDO_SENDER_CITY: undefined });
    expect(() => new ShipmondoShippingProvider(config, makePrismaMock())).toThrow(
      /requires SHIPMONDO_API_USER/,
    );
  });
});

describe("ShipmondoShippingProvider.listAvailableMethods", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("returns [] when destination or parcel is missing — no external call made", async () => {
    const provider = new ShipmondoShippingProvider(makeConfigMock(), makePrismaMock());

    expect(await provider.listAvailableMethods()).toEqual([]);
    expect(await provider.listAvailableMethods(DESTINATION)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] for a destination outside Sweden — no external call made", async () => {
    const provider = new ShipmondoShippingProvider(makeConfigMock(), makePrismaMock());

    const quotes = await provider.listAvailableMethods({ ...DESTINATION, country: "DK" }, PARCEL);

    expect(quotes).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] when destination has no city — DHL Freight's own upstream zip/city validation needs it", async () => {
    const provider = new ShipmondoShippingProvider(makeConfigMock(), makePrismaMock());

    const quotes = await provider.listAvailableMethods({ ...DESTINATION, city: undefined }, PARCEL);

    expect(quotes).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a live-priced quote, converting Shipmondo's decimal SEK price to minor units", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ price: 189.52 }),
    });
    const provider = new ShipmondoShippingProvider(makeConfigMock(), makePrismaMock());

    const quotes = await provider.listAvailableMethods(DESTINATION, PARCEL);

    expect(quotes).toEqual([
      {
        shippingMethodId: "method-1",
        code: "SHIPMONDO_DHLFSE_P",
        nameSv: "DHL Freight – Paket",
        nameEn: "DHL Freight – Parcel",
        priceMinor: 18952,
        currency: "SEK",
        minDeliveryDays: 1,
        maxDeliveryDays: 3,
        requiresPickupPoint: false,
      },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://sandbox.shipmondo.com/api/public/v3/quotes");
    expect(init.headers).toMatchObject({ Authorization: expect.stringMatching(/^Basic /) });
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      product_code: "DHLFSE_P",
      sender: { address1: "Drottninggatan 1", zipcode: "111 51", city: "Stockholm", country_code: "SE" },
      receiver: { zipcode: "411 36", city: "Göteborg", country_code: "SE" },
      parcels: [{ quantity: 1, weight: 1000, length: 30, width: 20, height: 15, packaging: "PK" }],
    });
  });

  it("skips a product Shipmondo 422s on (no agreement / can't price it) rather than failing the whole list", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: "Carrier post_nord is only available through own agreements." }),
    });
    const provider = new ShipmondoShippingProvider(makeConfigMock(), makePrismaMock());

    expect(await provider.listAvailableMethods(DESTINATION, PARCEL)).toEqual([]);
  });

  it("applies the default parcel box size when no real dimensions are available", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ price: 100 }) });
    const provider = new ShipmondoShippingProvider(makeConfigMock(), makePrismaMock());

    await provider.listAvailableMethods(DESTINATION, { weightGrams: 500 });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.parcels[0]).toMatchObject({ weight: 500, length: 30, width: 20, height: 15 });
  });

  it("skips a configured product with no matching seeded ShippingMethod row", async () => {
    const prisma = makePrismaMock({
      shippingMethod: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
    });
    const provider = new ShipmondoShippingProvider(makeConfigMock(), prisma);

    expect(await provider.listAvailableMethods(DESTINATION, PARCEL)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on an unexpected (non-422) error status — a real integration failure, not a 'not quotable' outcome", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const provider = new ShipmondoShippingProvider(makeConfigMock(), makePrismaMock());

    await expect(provider.listAvailableMethods(DESTINATION, PARCEL)).rejects.toThrow(
      /status 500/,
    );
  });
});

describe("ShipmondoShippingProvider.getQuote", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("returns null for a nonexistent or deactivated method — no external call made", async () => {
    const provider = new ShipmondoShippingProvider(makeConfigMock(), makePrismaMock());
    const tx = {
      shippingMethod: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as Prisma.TransactionClient;

    expect(await provider.getQuote(tx, "missing", DESTINATION, PARCEL)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null for a ShippingMethod row this provider doesn't recognize (e.g. Manual's STANDARD/OMBUD)", async () => {
    const provider = new ShipmondoShippingProvider(makeConfigMock(), makePrismaMock());
    const tx = {
      shippingMethod: { findUnique: vi.fn().mockResolvedValue({ ...METHOD_ROW, code: "STANDARD" }) },
    } as unknown as Prisma.TransactionClient;

    expect(await provider.getQuote(tx, "ship-1", DESTINATION, PARCEL)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-derives a fresh live price through the given transaction client — not this.prisma", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ price: 42.5 }) });
    const prisma = makePrismaMock();
    const provider = new ShipmondoShippingProvider(makeConfigMock(), prisma);
    const txFindUnique = vi.fn().mockResolvedValue(METHOD_ROW);
    const tx = { shippingMethod: { findUnique: txFindUnique } } as unknown as Prisma.TransactionClient;

    const quote = await provider.getQuote(tx, "method-1", DESTINATION, PARCEL);

    expect(quote?.priceMinor).toBe(4250);
    expect(txFindUnique).toHaveBeenCalledWith({ where: { id: "method-1" } });
    expect(prisma.shippingMethod.findUnique).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when destination/parcel are missing — never re-uses a stale price", async () => {
    const provider = new ShipmondoShippingProvider(makeConfigMock(), makePrismaMock());
    const tx = {
      shippingMethod: { findUnique: vi.fn().mockResolvedValue(METHOD_ROW) },
    } as unknown as Prisma.TransactionClient;

    expect(await provider.getQuote(tx, "method-1")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ShipmondoShippingProvider pickup points", () => {
  it("listPickupPoints/getPickupPoint are always empty — no configured product requires one", async () => {
    const provider = new ShipmondoShippingProvider(makeConfigMock(), makePrismaMock());

    expect(await provider.listPickupPoints("method-1", "11122")).toEqual([]);
    expect(
      await provider.getPickupPoint(
        {} as Prisma.TransactionClient,
        "method-1",
        "any",
        "11122",
      ),
    ).toBeNull();
  });
});

const SHIPMENT_DESTINATION = {
  ...DESTINATION,
  name: "Test Testsson",
  line1: "Avenyn 1",
};

describe("ShipmondoShippingProvider.createShipment", () => {
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
    const provider = new ShipmondoShippingProvider(makeConfigMock(), prisma);

    const result = await provider.createShipment("method-1", SHIPMENT_DESTINATION, PARCEL, "AF-TEST-1");

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null for a nonexistent ShippingMethod row", async () => {
    const prisma = makePrismaMock({
      shippingMethod: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const provider = new ShipmondoShippingProvider(makeConfigMock(), prisma);

    const result = await provider.createShipment("missing", SHIPMENT_DESTINATION, PARCEL, "AF-TEST-1");

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a real shipment and returns carrier/tracking info, using Shipmondo's own agreement", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 66934091, pkg_no: "2906731480" }),
    });
    const provider = new ShipmondoShippingProvider(makeConfigMock(), makePrismaMock());

    const result = await provider.createShipment("method-1", SHIPMENT_DESTINATION, PARCEL, "AF-TEST-1");

    expect(result).toEqual({
      carrierName: "DHL Freight",
      trackingNumber: "2906731480",
      trackingUrl: null,
      providerShipmentId: "66934091",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://sandbox.shipmondo.com/api/public/v3/shipments");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      own_agreement: false,
      product_code: "DHLFSE_P",
      reference: "AF-TEST-1",
      parties: [
        expect.objectContaining({
          type: "sender",
          name: "Âme de Fil",
          address1: "Drottninggatan 1",
          postal_code: "111 51",
          city: "Stockholm",
          country_code: "SE",
        }),
        expect.objectContaining({
          type: "receiver",
          name: "Test Testsson",
          address1: "Avenyn 1",
          postal_code: "411 36",
          city: "Göteborg",
          country_code: "SE",
        }),
      ],
      parcels: [{ quantity: 1, weight: 1000, length: 30, width: 20, height: 15, packaging: "PK" }],
    });
  });

  it("throws (never falls back silently) when the live call fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: "Invalid zip code and/or city." }),
    });
    const provider = new ShipmondoShippingProvider(makeConfigMock(), makePrismaMock());

    await expect(
      provider.createShipment("method-1", SHIPMENT_DESTINATION, PARCEL, "AF-TEST-1"),
    ).rejects.toThrow(/Invalid zip code/);
  });
});
