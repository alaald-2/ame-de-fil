import { describe, expect, it, afterEach, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { CartController } from "./cart.controller.ts";
import { CartService } from "./cart.service.ts";
import { SessionAuthGuard } from "../common/guards/session-auth.guard.ts";
import { PermissionsGuard } from "../common/guards/permissions.guard.ts";
import { CsrfGuard } from "../common/csrf/csrf.guard.ts";
import { SessionService } from "../identity/session.service.ts";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter.ts";
import type { AuthContext } from "../common/types/auth-context.ts";

const CONFIG_VALUES: Record<string, unknown> = {
  SESSION_COOKIE_NAME: "ame_session",
  CART_COOKIE_NAME: "ame_cart",
  CART_COOKIE_TTL_DAYS: 30,
  NODE_ENV: "test",
};

const EMPTY_CART = {
  cartId: null,
  items: [],
  itemCount: 0,
  subtotal: { amountMinor: 0, currency: "SEK" },
};

// Real SessionAuthGuard + PermissionsGuard + CsrfGuard, wired in the exact
// order app.module.ts uses — this is the boundary that must keep working
// for both anonymous guest callers (CSRF-exempt, @OptionalAuth() with no
// auth) and authenticated ones (CSRF still fully required), same pattern as
// inventory/admin-products' authorization specs.
async function bootApp(validateSession: (token: string) => Promise<AuthContext | null>) {
  const getCart = vi.fn().mockResolvedValue(EMPTY_CART);
  const addItem = vi.fn().mockResolvedValue({ ...EMPTY_CART, cartId: "cart-1" });
  const updateItemQuantity = vi.fn().mockResolvedValue({ ...EMPTY_CART, cartId: "cart-1" });
  const removeItem = vi.fn().mockResolvedValue(EMPTY_CART);

  const moduleRef = await Test.createTestingModule({
    controllers: [CartController],
    providers: [
      { provide: CartService, useValue: { getCart, addItem, updateItemQuantity, removeItem } },
      { provide: SessionService, useValue: { validateSession } },
      { provide: ConfigService, useValue: { get: (key: string) => CONFIG_VALUES[key] } },
      { provide: APP_GUARD, useClass: SessionAuthGuard },
      { provide: APP_GUARD, useClass: PermissionsGuard },
      { provide: APP_GUARD, useClass: CsrfGuard },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, getCart, addItem, updateItemQuantity, removeItem };
}

const AUTH: AuthContext = { userId: "user-1", sessionId: "s1", csrfToken: "csrf", permissions: [] };

describe("GET /cart", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns the empty shape for a fully anonymous caller, without calling the service", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer()).get("/cart").query({ locale: "sv-SE" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(EMPTY_CART);
    expect(booted.getCart).not.toHaveBeenCalled();
  });

  it("returns 400 when locale is missing, before any identity resolution", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer()).get("/cart");

    expect(response.status).toBe(400);
    expect(booted.getCart).not.toHaveBeenCalled();
  });

  it("resolves a guest identity from the cart cookie", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    await supertest(app.getHttpServer())
      .get("/cart")
      .query({ locale: "sv-SE" })
      .set("Cookie", "ame_cart=guest-token");

    expect(booted.getCart).toHaveBeenCalledWith({ guestToken: "guest-token" }, "sv-SE");
  });

  it("resolves an authenticated identity from a valid session, ignoring any guest cookie", async () => {
    const booted = await bootApp(async () => AUTH);
    app = booted.app;

    await supertest(app.getHttpServer())
      .get("/cart")
      .query({ locale: "en" })
      .set("Cookie", ["ame_session=token", "ame_cart=guest-token"]);

    expect(booted.getCart).toHaveBeenCalledWith({ userId: "user-1" }, "en");
  });

  it("still returns 401 when the session cookie is present but invalid — @OptionalAuth() doesn't weaken this", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/cart")
      .query({ locale: "sv-SE" })
      .set("Cookie", "ame_session=stale");

    expect(response.status).toBe(401);
    expect(booted.getCart).not.toHaveBeenCalled();
  });
});

describe("POST /cart/items", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  const VALID_BODY = { variantId: "var-1", quantity: 2 };

  it("mints and sets a guest-cart cookie for a brand-new anonymous caller", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/cart/items")
      .query({ locale: "sv-SE" })
      .send(VALID_BODY);

    expect(response.status).toBe(201);
    const setCookie = response.headers["set-cookie"];
    expect(setCookie?.[0]).toMatch(/^ame_cart=/);
    expect(booted.addItem).toHaveBeenCalledWith(
      expect.objectContaining({ guestToken: expect.any(String) }),
      VALID_BODY,
      "sv-SE",
    );
  });

  it("reuses an existing guest cookie without setting a new one", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/cart/items")
      .query({ locale: "sv-SE" })
      .set("Cookie", "ame_cart=existing-token")
      .send(VALID_BODY);

    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(booted.addItem).toHaveBeenCalledWith(
      { guestToken: "existing-token" },
      VALID_BODY,
      "sv-SE",
    );
  });

  it("uses the authenticated identity and never sets a guest cookie", async () => {
    const booted = await bootApp(async () => AUTH);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/cart/items")
      .query({ locale: "sv-SE" })
      .set("Cookie", "ame_session=token")
      .set("x-csrf-token", "csrf")
      .send(VALID_BODY);

    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(booted.addItem).toHaveBeenCalledWith({ userId: "user-1" }, VALID_BODY, "sv-SE");
  });

  // Regression test (review follow-up): the @OptionalAuth() CSRF bypass
  // must never leak onto an authenticated caller — only a fully anonymous
  // one. Proves this through the real guard chain, not just CsrfGuard in
  // isolation (see csrf.guard.spec.ts).
  it("returns 403 for an authenticated caller's mutation with no csrf header — @OptionalAuth() does not exempt authenticated callers", async () => {
    const booted = await bootApp(async () => AUTH);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/cart/items")
      .query({ locale: "sv-SE" })
      .set("Cookie", "ame_session=token")
      .send(VALID_BODY);

    expect(response.status).toBe(403);
    expect(booted.addItem).not.toHaveBeenCalled();
  });

  it("returns 201 for a fully anonymous caller's mutation with NO csrf header at all — the sanctioned bypass", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/cart/items")
      .query({ locale: "sv-SE" })
      .send(VALID_BODY);

    expect(response.status).toBe(201);
    expect(booted.addItem).toHaveBeenCalled();
  });

  it("returns 400 for an invalid body before the service is ever called", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/cart/items")
      .query({ locale: "sv-SE" })
      .send({ variantId: "var-1", quantity: 0 });

    expect(response.status).toBe(400);
    expect(booted.addItem).not.toHaveBeenCalled();
  });
});

describe("PATCH /cart/items/:itemId and DELETE /cart/items/:itemId — ownership", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("PATCH returns 404 for a fully anonymous caller with no cart cookie at all", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .patch("/cart/items/item-1")
      .query({ locale: "sv-SE" })
      .send({ quantity: 3 });

    expect(response.status).toBe(404);
    expect(booted.updateItemQuantity).not.toHaveBeenCalled();
  });

  it("PATCH scopes the update to the caller's own resolved identity", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    await supertest(app.getHttpServer())
      .patch("/cart/items/item-1")
      .query({ locale: "sv-SE" })
      .set("Cookie", "ame_cart=guest-token")
      .send({ quantity: 3 });

    expect(booted.updateItemQuantity).toHaveBeenCalledWith(
      { guestToken: "guest-token" },
      "item-1",
      3,
      "sv-SE",
    );
  });

  it("DELETE returns 404 for a fully anonymous caller with no cart cookie at all", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .delete("/cart/items/item-1")
      .query({ locale: "sv-SE" });

    expect(response.status).toBe(404);
    expect(booted.removeItem).not.toHaveBeenCalled();
  });

  it("DELETE scopes the removal to the caller's own resolved identity", async () => {
    const booted = await bootApp(async () => AUTH);
    app = booted.app;

    await supertest(app.getHttpServer())
      .delete("/cart/items/item-1")
      .query({ locale: "sv-SE" })
      .set("Cookie", "ame_session=token")
      .set("x-csrf-token", "csrf");

    expect(booted.removeItem).toHaveBeenCalledWith({ userId: "user-1" }, "item-1", "sv-SE");
  });

  it("DELETE returns 403 for an authenticated caller with no csrf header", async () => {
    const booted = await bootApp(async () => AUTH);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .delete("/cart/items/item-1")
      .query({ locale: "sv-SE" })
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(403);
    expect(booted.removeItem).not.toHaveBeenCalled();
  });

  it("PATCH returns 200 for a fully anonymous caller with NO csrf header — the sanctioned bypass", async () => {
    const booted = await bootApp(async () => null);
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .patch("/cart/items/item-1")
      .query({ locale: "sv-SE" })
      .set("Cookie", "ame_cart=guest-token")
      .send({ quantity: 3 });

    expect(response.status).toBe(200);
    expect(booted.updateItemQuantity).toHaveBeenCalled();
  });
});
