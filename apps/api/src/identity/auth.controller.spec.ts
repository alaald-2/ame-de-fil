import { describe, expect, it, afterEach, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { AuthController } from "./auth.controller.ts";
import { AuthService } from "./auth.service.ts";
import { InventoryController } from "../inventory/inventory.controller.ts";
import { InventoryService } from "../inventory/inventory.service.ts";
import { SessionService } from "./session.service.ts";
import { SessionAuthGuard } from "../common/guards/session-auth.guard.ts";
import { PermissionsGuard } from "../common/guards/permissions.guard.ts";
import { CsrfGuard } from "../common/csrf/csrf.guard.ts";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard.ts";
import { RATE_LIMIT_STORE } from "../common/rate-limit/rate-limit-store.ts";
import { InMemoryRateLimitStore } from "../common/rate-limit/in-memory-rate-limit.store.ts";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter.ts";
import type { AuthContext } from "../common/types/auth-context.ts";

const CONFIG_VALUES: Record<string, unknown> = {
  SESSION_COOKIE_NAME: "ame_session",
  CSRF_COOKIE_NAME: "ame_csrf",
  NODE_ENV: "development",
};

const AUTH: AuthContext = {
  userId: "user-1",
  sessionId: "session-token",
  csrfToken: "csrf-token",
  permissions: ["inventory.view"],
};

const SAFE_USER = {
  id: "user-1",
  email: "admin@example.com",
  firstName: "Admin",
  lastName: "Adminsson",
  locale: "sv-SE",
  permissions: ["inventory.view"],
};

interface BootOptions {
  validateSession?: (token: string) => Promise<AuthContext | null>;
  login?: ReturnType<typeof vi.fn>;
  logout?: ReturnType<typeof vi.fn>;
  getSafeUser?: ReturnType<typeof vi.fn>;
  list?: ReturnType<typeof vi.fn>;
  configOverrides?: Record<string, unknown>;
}

async function bootApp(options: BootOptions = {}) {
  const login = options.login ?? vi.fn();
  const logout = options.logout ?? vi.fn().mockResolvedValue(undefined);
  const getSafeUser = options.getSafeUser ?? vi.fn().mockResolvedValue(SAFE_USER);
  const list = options.list ?? vi.fn().mockResolvedValue({ items: [], total: 0 });
  const validateSession = options.validateSession ?? (async () => null);
  const configValues = { ...CONFIG_VALUES, ...options.configOverrides };

  const moduleRef = await Test.createTestingModule({
    controllers: [AuthController, InventoryController],
    providers: [
      { provide: AuthService, useValue: { login, logout, getSafeUser } },
      { provide: InventoryService, useValue: { list } },
      { provide: SessionService, useValue: { validateSession } },
      { provide: ConfigService, useValue: { get: (key: string) => configValues[key] } },
      { provide: APP_GUARD, useClass: SessionAuthGuard },
      { provide: APP_GUARD, useClass: PermissionsGuard },
      { provide: APP_GUARD, useClass: CsrfGuard },
      { provide: APP_GUARD, useClass: RateLimitGuard },
      { provide: RATE_LIMIT_STORE, useClass: InMemoryRateLimitStore },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, login, logout, getSafeUser, list };
}

describe("POST /auth/login", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("sets httpOnly session + readable CSRF cookies and returns the safe user, with no CSRF header required", async () => {
    const login = vi.fn().mockResolvedValue({
      token: "new-session-token",
      csrfToken: "new-csrf-token",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      user: SAFE_USER,
    });
    const booted = await bootApp({ login });
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@example.com", password: "correct-password" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: SAFE_USER, csrfToken: "new-csrf-token" });
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");

    const setCookie = response.headers["set-cookie"] as unknown as string[];
    const sessionCookie = setCookie.find((c) => c.startsWith("ame_session="));
    const csrfCookie = setCookie.find((c) => c.startsWith("ame_csrf="));

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("SameSite=Lax");
    expect(sessionCookie).not.toContain("Secure"); // NODE_ENV=development in this test

    expect(csrfCookie).toBeDefined();
    expect(csrfCookie).not.toContain("HttpOnly"); // must be JS-readable for double-submit
    expect(csrfCookie).toContain("SameSite=Lax");
  });

  it("sets Secure on both cookies when NODE_ENV=production", async () => {
    const login = vi.fn().mockResolvedValue({
      token: "t",
      csrfToken: "c",
      expiresAt: new Date(Date.now() + 60_000),
      user: SAFE_USER,
    });
    const booted = await bootApp({ login, configOverrides: { NODE_ENV: "production" } });
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@example.com", password: "correct-password" });

    const setCookie = response.headers["set-cookie"] as unknown as string[];
    expect(setCookie.every((c) => c.includes("Secure"))).toBe(true);
  });

  it("rejects a malformed body with 400 before ever calling AuthService", async () => {
    const booted = await bootApp();
    app = booted.app;

    const response = await supertest(app.getHttpServer()).post("/auth/login").send({ email: "not-an-email" });

    expect(response.status).toBe(400);
    expect(booted.login).not.toHaveBeenCalled();
  });

  it("returns 401 with no Set-Cookie header on invalid credentials", async () => {
    const login = vi.fn().mockRejectedValue(
      new UnauthorizedException({ error: "InvalidCredentials", message: "Invalid email or password" }),
    );
    const booted = await bootApp({ login });
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@example.com", password: "wrong" });

    expect(response.status).toBe(401);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("returns 429 once the per-IP rate limit is exceeded", async () => {
    const login = vi.fn().mockRejectedValue(new UnauthorizedException({ error: "InvalidCredentials", message: "x" }));
    const booted = await bootApp({ login });
    app = booted.app;

    for (let i = 0; i < 5; i++) {
      const attempt = await supertest(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "admin@example.com", password: "wrong" });
      expect(attempt.status).toBe(401);
    }

    const limited = await supertest(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@example.com", password: "wrong" });

    expect(limited.status).toBe(429);
  });
});

describe("GET /auth/session", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns { authenticated: false } for a fully anonymous caller (no cookie), with 200 not 401", async () => {
    const booted = await bootApp();
    app = booted.app;

    const response = await supertest(app.getHttpServer()).get("/auth/session");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ authenticated: false });
    expect(booted.getSafeUser).not.toHaveBeenCalled();
  });

  it("returns the safe user + csrfToken for an authenticated caller", async () => {
    const booted = await bootApp({ validateSession: async () => AUTH });
    app = booted.app;

    const response = await supertest(app.getHttpServer()).get("/auth/session").set("Cookie", "ame_session=token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ authenticated: true, user: SAFE_USER, csrfToken: "csrf-token" });
  });

  it("returns 401 (not { authenticated: false }) for a present but invalid/expired session cookie", async () => {
    const booted = await bootApp({ validateSession: async () => null });
    app = booted.app;

    const response = await supertest(app.getHttpServer()).get("/auth/session").set("Cookie", "ame_session=stale");

    expect(response.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("requires a session — 401 with no cookie at all", async () => {
    const booted = await bootApp();
    app = booted.app;

    const response = await supertest(app.getHttpServer()).post("/auth/logout");

    expect(response.status).toBe(401);
    expect(booted.logout).not.toHaveBeenCalled();
  });

  it("requires a valid CSRF header even with a valid session cookie — 403 without one", async () => {
    const booted = await bootApp({ validateSession: async () => AUTH });
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/auth/logout")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(403);
    expect(booted.logout).not.toHaveBeenCalled();
  });

  it("revokes the session and clears both cookies on success", async () => {
    const booted = await bootApp({ validateSession: async () => AUTH });
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/auth/logout")
      .set("Cookie", "ame_session=token")
      .set("X-CSRF-Token", "csrf-token");

    expect(response.status).toBe(204);
    expect(booted.logout).toHaveBeenCalledWith("session-token");

    const setCookie = response.headers["set-cookie"] as unknown as string[];
    // Express's clearCookie sends an already-expired Max-Age=0 cookie —
    // this is what actually removes it from the browser.
    expect(setCookie.some((c) => c.startsWith("ame_session=") && c.includes("Expires="))).toBe(true);
    expect(setCookie.some((c) => c.startsWith("ame_csrf=") && c.includes("Expires="))).toBe(true);
  });
});

// Proves the session AuthController issues is genuinely usable against the
// pre-existing admin guard chain (SessionAuthGuard + PermissionsGuard) —
// InventoryController is a real, unmodified controller, not a stand-in.
describe("existing admin authorization still works with an AuthController-issued session", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("grants access to a real admin route when the session carries the required permission", async () => {
    const booted = await bootApp({ validateSession: async () => AUTH }); // has "inventory.view"
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/inventory")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(200);
    expect(booted.list).toHaveBeenCalled();
  });

  it("denies a real admin route when the session lacks the required permission", async () => {
    const noPermissions: AuthContext = { ...AUTH, permissions: [] };
    const booted = await bootApp({ validateSession: async () => noPermissions });
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/admin/inventory")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(403);
    expect(booted.list).not.toHaveBeenCalled();
  });

  it("denies a real admin route entirely for an anonymous caller", async () => {
    const booted = await bootApp();
    app = booted.app;

    const response = await supertest(app.getHttpServer()).get("/admin/inventory");

    expect(response.status).toBe(401);
    expect(booted.list).not.toHaveBeenCalled();
  });
});
