import { describe, expect, it, afterEach, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { AuthController } from "./auth.controller.ts";
import { AuthService } from "./auth.service.ts";
import { GOOGLE_OAUTH_PROVIDER } from "./google-oauth.provider.ts";
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
  STOREFRONT_BASE_URL: "http://localhost:3001",
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
  loginWithGoogle?: ReturnType<typeof vi.fn>;
  getLoginMethod?: ReturnType<typeof vi.fn>;
  requestLoginOtp?: ReturnType<typeof vi.fn>;
  loginWithOtp?: ReturnType<typeof vi.fn>;
  list?: ReturnType<typeof vi.fn>;
  configOverrides?: Record<string, unknown>;
  googleOAuthProvider?: {
    createAuthorizationRequest: ReturnType<typeof vi.fn>;
    exchangeCodeForProfile: ReturnType<typeof vi.fn>;
  };
}

// A never-configured PendingOAuthProvider stand-in by default — matches
// what a real boot looks like whenever GOOGLE_*/STOREFRONT_BASE_URL are
// unset, without needing every unrelated test in this file (login/logout/
// session) to know Google sign-in exists at all.
function makePendingGoogleProviderMock() {
  const notConfigured = () => {
    throw new ServiceUnavailableException({
      error: "OAuthNotConfigured",
      message: "Google sign-in is not configured",
    });
  };
  return {
    createAuthorizationRequest: vi.fn(notConfigured),
    exchangeCodeForProfile: vi.fn(notConfigured),
  };
}

async function bootApp(options: BootOptions = {}) {
  const login = options.login ?? vi.fn();
  const logout = options.logout ?? vi.fn().mockResolvedValue(undefined);
  const getSafeUser = options.getSafeUser ?? vi.fn().mockResolvedValue(SAFE_USER);
  const loginWithGoogle = options.loginWithGoogle ?? vi.fn();
  const getLoginMethod =
    options.getLoginMethod ?? vi.fn().mockResolvedValue({ method: "password" });
  const requestLoginOtp = options.requestLoginOtp ?? vi.fn().mockResolvedValue({ message: "ok" });
  const loginWithOtp = options.loginWithOtp ?? vi.fn();
  const list = options.list ?? vi.fn().mockResolvedValue({ items: [], total: 0 });
  const validateSession = options.validateSession ?? (async () => null);
  const googleOAuthProvider = options.googleOAuthProvider ?? makePendingGoogleProviderMock();
  const configValues = { ...CONFIG_VALUES, ...options.configOverrides };

  const moduleRef = await Test.createTestingModule({
    controllers: [AuthController, InventoryController],
    providers: [
      {
        provide: AuthService,
        useValue: {
          login,
          logout,
          getSafeUser,
          loginWithGoogle,
          getLoginMethod,
          requestLoginOtp,
          loginWithOtp,
        },
      },
      { provide: InventoryService, useValue: { list } },
      { provide: SessionService, useValue: { validateSession } },
      { provide: ConfigService, useValue: { get: (key: string) => configValues[key] } },
      { provide: GOOGLE_OAUTH_PROVIDER, useValue: googleOAuthProvider },
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
  return {
    app,
    login,
    logout,
    getSafeUser,
    loginWithGoogle,
    getLoginMethod,
    requestLoginOtp,
    loginWithOtp,
    list,
    googleOAuthProvider,
  };
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

    const response = await supertest(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "not-an-email" });

    expect(response.status).toBe(400);
    expect(booted.login).not.toHaveBeenCalled();
  });

  it("returns 401 with no Set-Cookie header on invalid credentials", async () => {
    const login = vi
      .fn()
      .mockRejectedValue(
        new UnauthorizedException({
          error: "InvalidCredentials",
          message: "Invalid email or password",
        }),
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
    const login = vi
      .fn()
      .mockRejectedValue(new UnauthorizedException({ error: "InvalidCredentials", message: "x" }));
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

describe("POST /auth/login-method", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns whatever AuthService.getLoginMethod resolves, with no cookies set", async () => {
    const getLoginMethod = vi.fn().mockResolvedValue({ method: "otp" });
    const booted = await bootApp({ getLoginMethod });
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/auth/login-method")
      .send({ email: "customer@example.com" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ method: "otp" });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(getLoginMethod).toHaveBeenCalledWith({ email: "customer@example.com" });
  });

  it("rejects a malformed body with 400 before ever calling AuthService", async () => {
    const booted = await bootApp();
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/auth/login-method")
      .send({ email: "not-an-email" });

    expect(response.status).toBe(400);
    expect(booted.getLoginMethod).not.toHaveBeenCalled();
  });

  it("returns 429 once the per-IP rate limit (20/min) is exceeded", async () => {
    const booted = await bootApp();
    app = booted.app;

    for (let i = 0; i < 20; i++) {
      const attempt = await supertest(app.getHttpServer())
        .post("/auth/login-method")
        .send({ email: "customer@example.com" });
      expect(attempt.status).toBe(200);
    }

    const limited = await supertest(app.getHttpServer())
      .post("/auth/login-method")
      .send({ email: "customer@example.com" });

    expect(limited.status).toBe(429);
  });
});

describe("POST /auth/otp/request", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns whatever AuthService.requestLoginOtp resolves, with no cookies set", async () => {
    const requestLoginOtp = vi.fn().mockResolvedValue({ message: "generic" });
    const booted = await bootApp({ requestLoginOtp });
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/auth/otp/request")
      .send({ email: "customer@example.com" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "generic" });
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("returns 429 once the per-IP rate limit (5/min) is exceeded", async () => {
    const booted = await bootApp();
    app = booted.app;

    for (let i = 0; i < 5; i++) {
      const attempt = await supertest(app.getHttpServer())
        .post("/auth/otp/request")
        .send({ email: "customer@example.com" });
      expect(attempt.status).toBe(200);
    }

    const limited = await supertest(app.getHttpServer())
      .post("/auth/otp/request")
      .send({ email: "customer@example.com" });

    expect(limited.status).toBe(429);
  });
});

describe("POST /auth/otp/verify", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("sets the same session/CSRF cookies as /auth/login on a correct code, with no CSRF header required", async () => {
    const loginWithOtp = vi.fn().mockResolvedValue({
      token: "otp-session-token",
      csrfToken: "otp-csrf-token",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      user: SAFE_USER,
    });
    const booted = await bootApp({ loginWithOtp });
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/auth/otp/verify")
      .send({ email: "customer@example.com", code: "042017" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: SAFE_USER, csrfToken: "otp-csrf-token" });

    const setCookie = response.headers["set-cookie"] as unknown as string[];
    const sessionCookie = setCookie.find((c) => c.startsWith("ame_session="));
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("otp-session-token");
  });

  it("rejects a malformed (non-6-digit) code with 400 before ever calling AuthService", async () => {
    const booted = await bootApp();
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/auth/otp/verify")
      .send({ email: "customer@example.com", code: "12" });

    expect(response.status).toBe(400);
    expect(booted.loginWithOtp).not.toHaveBeenCalled();
  });

  it("returns 400 with no Set-Cookie header on an invalid/expired code", async () => {
    const loginWithOtp = vi
      .fn()
      .mockRejectedValue(new BadRequestException({ error: "InvalidOrExpiredCode" }));
    const booted = await bootApp({ loginWithOtp });
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .post("/auth/otp/verify")
      .send({ email: "customer@example.com", code: "000000" });

    expect(response.status).toBe(400);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("returns 429 once the per-IP rate limit (10/min) is exceeded", async () => {
    const loginWithOtp = vi
      .fn()
      .mockRejectedValue(new BadRequestException({ error: "InvalidOrExpiredCode" }));
    const booted = await bootApp({ loginWithOtp });
    app = booted.app;

    for (let i = 0; i < 10; i++) {
      const attempt = await supertest(app.getHttpServer())
        .post("/auth/otp/verify")
        .send({ email: "customer@example.com", code: "000000" });
      expect(attempt.status).toBe(400);
    }

    const limited = await supertest(app.getHttpServer())
      .post("/auth/otp/verify")
      .send({ email: "customer@example.com", code: "000000" });

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

    const response = await supertest(app.getHttpServer())
      .get("/auth/session")
      .set("Cookie", "ame_session=token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      authenticated: true,
      user: SAFE_USER,
      csrfToken: "csrf-token",
    });
  });

  it("returns 401 (not { authenticated: false }) for a present but invalid/expired session cookie", async () => {
    const booted = await bootApp({ validateSession: async () => null });
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/auth/session")
      .set("Cookie", "ame_session=stale");

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
    expect(setCookie.some((c) => c.startsWith("ame_session=") && c.includes("Expires="))).toBe(
      true,
    );
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

describe("GET /auth/google", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("redirects to Google's authorization URL and sets httpOnly state/PKCE cookies", async () => {
    const googleOAuthProvider = {
      createAuthorizationRequest: vi
        .fn()
        .mockReturnValue({
          url: "https://accounts.google.com/o/oauth2/v2/auth?x=1",
          state: "s1",
          codeVerifier: "v1",
        }),
      exchangeCodeForProfile: vi.fn(),
    };
    const booted = await bootApp({ googleOAuthProvider });
    app = booted.app;

    const response = await supertest(app.getHttpServer()).get("/auth/google");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("https://accounts.google.com/o/oauth2/v2/auth?x=1");

    const setCookie = response.headers["set-cookie"] as unknown as string[];
    const stateCookie = setCookie.find((c) => c.startsWith("ame_oauth_state="));
    const pkceCookie = setCookie.find((c) => c.startsWith("ame_oauth_pkce="));
    expect(stateCookie).toContain("HttpOnly");
    expect(pkceCookie).toContain("HttpOnly");
    expect(stateCookie).toContain("s1");
    expect(pkceCookie).toContain("v1");
  });

  it("returns 503 without setting any cookie when STOREFRONT_BASE_URL is unset", async () => {
    const booted = await bootApp({ configOverrides: { STOREFRONT_BASE_URL: undefined } });
    app = booted.app;

    const response = await supertest(app.getHttpServer()).get("/auth/google");

    expect(response.status).toBe(503);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("returns 503 when Google itself isn't configured (PendingOAuthProvider)", async () => {
    const booted = await bootApp(); // default googleOAuthProvider mock throws, matching PendingOAuthProvider
    app = booted.app;

    const response = await supertest(app.getHttpServer()).get("/auth/google");

    expect(response.status).toBe(503);
  });
});

describe("GET /auth/google/callback", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  function cookies(...pairs: string[]): string {
    return pairs.join("; ");
  }

  it("on success: exchanges the code, logs in, sets session cookies, clears the flow cookies, and redirects to the storefront with no query", async () => {
    const googleOAuthProvider = {
      createAuthorizationRequest: vi.fn(),
      exchangeCodeForProfile: vi.fn().mockResolvedValue({
        sub: "sub-1",
        email: "customer@example.com",
        emailVerified: true,
        givenName: "Test",
        familyName: null,
      }),
    };
    const loginWithGoogle = vi.fn().mockResolvedValue({
      token: "new-session-token",
      csrfToken: "new-csrf-token",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      user: SAFE_USER,
    });
    const booted = await bootApp({ googleOAuthProvider, loginWithGoogle });
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/auth/google/callback?code=auth-code&state=matching-state")
      .set("Cookie", cookies("ame_oauth_state=matching-state", "ame_oauth_pkce=verifier-1"));

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("http://localhost:3001");
    expect(googleOAuthProvider.exchangeCodeForProfile).toHaveBeenCalledWith(
      "auth-code",
      "verifier-1",
    );
    expect(loginWithGoogle).toHaveBeenCalled();

    const setCookie = response.headers["set-cookie"] as unknown as string[];
    expect(setCookie.some((c) => c.startsWith("ame_session=new-session-token"))).toBe(true);
    expect(setCookie.some((c) => c.startsWith("ame_csrf=new-csrf-token"))).toBe(true);
    // Flow cookies cleared (expired), never left behind.
    expect(
      setCookie
        .filter((c) => c.startsWith("ame_oauth_state="))
        .every((c) => c.includes("Expires=")),
    ).toBe(true);
  });

  it("redirects with authError=google_denied when Google itself reports an error, without calling the provider", async () => {
    const googleOAuthProvider = {
      createAuthorizationRequest: vi.fn(),
      exchangeCodeForProfile: vi.fn(),
    };
    const booted = await bootApp({ googleOAuthProvider });
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/auth/google/callback?error=access_denied")
      .set("Cookie", cookies("ame_oauth_state=s", "ame_oauth_pkce=v"));

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("http://localhost:3001?authError=google_denied");
    expect(googleOAuthProvider.exchangeCodeForProfile).not.toHaveBeenCalled();
  });

  it("redirects with authError=invalid_request when the state/PKCE cookies are missing", async () => {
    const booted = await bootApp();
    app = booted.app;

    const response = await supertest(app.getHttpServer()).get(
      "/auth/google/callback?code=x&state=y",
    );

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("http://localhost:3001?authError=invalid_request");
  });

  it("redirects with authError=state_mismatch and never calls the provider when the state doesn't match the cookie", async () => {
    const googleOAuthProvider = {
      createAuthorizationRequest: vi.fn(),
      exchangeCodeForProfile: vi.fn(),
    };
    const booted = await bootApp({ googleOAuthProvider });
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/auth/google/callback?code=x&state=attacker-supplied")
      .set("Cookie", cookies("ame_oauth_state=real-state", "ame_oauth_pkce=v"));

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("http://localhost:3001?authError=state_mismatch");
    expect(googleOAuthProvider.exchangeCodeForProfile).not.toHaveBeenCalled();
  });

  it("redirects with authError=oauth_failed when the code exchange throws, setting no session cookie", async () => {
    const googleOAuthProvider = {
      createAuthorizationRequest: vi.fn(),
      exchangeCodeForProfile: vi.fn().mockRejectedValue(new Error("Google is down")),
    };
    const booted = await bootApp({ googleOAuthProvider });
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/auth/google/callback?code=x&state=s")
      .set("Cookie", cookies("ame_oauth_state=s", "ame_oauth_pkce=v"));

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("http://localhost:3001?authError=oauth_failed");
    const setCookie = response.headers["set-cookie"] as unknown as string[];
    expect(setCookie.some((c) => c.startsWith("ame_session=new"))).toBe(false);
  });

  it("redirects with authError=oauth_failed (never a distinct message) when AuthService rejects the profile, e.g. unverified email", async () => {
    const googleOAuthProvider = {
      createAuthorizationRequest: vi.fn(),
      exchangeCodeForProfile: vi.fn().mockResolvedValue({
        sub: "sub-1",
        email: "x@example.com",
        emailVerified: false,
        givenName: null,
        familyName: null,
      }),
    };
    const loginWithGoogle = vi
      .fn()
      .mockRejectedValue(new Error("Google account email is not verified"));
    const booted = await bootApp({ googleOAuthProvider, loginWithGoogle });
    app = booted.app;

    const response = await supertest(app.getHttpServer())
      .get("/auth/google/callback?code=x&state=s")
      .set("Cookie", cookies("ame_oauth_state=s", "ame_oauth_pkce=v"));

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("http://localhost:3001?authError=oauth_failed");
  });
});
