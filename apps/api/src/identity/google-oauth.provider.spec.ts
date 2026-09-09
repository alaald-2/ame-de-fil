import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ServiceUnavailableException } from "@nestjs/common";
import { GoogleOAuthClient, PendingOAuthProvider } from "./google-oauth.provider.ts";

describe("GoogleOAuthClient", () => {
  const client = new GoogleOAuthClient("client-id", "client-secret", "https://api.example.com/auth/google/callback");

  describe("createAuthorizationRequest", () => {
    it("builds a Google authorization URL with PKCE S256 and a random state, both returned alongside it", () => {
      const first = client.createAuthorizationRequest();
      const second = client.createAuthorizationRequest();

      const url = new URL(first.url);
      expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
      expect(url.searchParams.get("client_id")).toBe("client-id");
      expect(url.searchParams.get("redirect_uri")).toBe("https://api.example.com/auth/google/callback");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("scope")).toBe("openid email profile");
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("state")).toBe(first.state);
      expect(url.searchParams.get("code_challenge")).toBeTruthy();

      // Never the raw code_verifier itself, and never predictable across calls.
      expect(url.searchParams.get("code_challenge")).not.toBe(first.codeVerifier);
      expect(first.state).not.toBe(second.state);
      expect(first.codeVerifier).not.toBe(second.codeVerifier);
    });
  });

  describe("exchangeCodeForProfile", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("exchanges the code for a token, then fetches and normalizes the profile", async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "at-1" }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            sub: "google-sub-1",
            email: "customer@example.com",
            email_verified: true,
            given_name: "Ada",
            family_name: "Lovelace",
          }),
        });

      const profile = await client.exchangeCodeForProfile("auth-code", "verifier");

      expect(profile).toEqual({
        sub: "google-sub-1",
        email: "customer@example.com",
        emailVerified: true,
        givenName: "Ada",
        familyName: "Lovelace",
      });

      const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
      const body = tokenInit.body as URLSearchParams;
      expect(body.get("code")).toBe("auth-code");
      expect(body.get("code_verifier")).toBe("verifier");
      expect(body.get("client_secret")).toBe("client-secret");

      const [profileUrl, profileInit] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(profileUrl).toBe("https://www.googleapis.com/oauth2/v3/userinfo");
      expect((profileInit.headers as Record<string, string>).Authorization).toBe("Bearer at-1");
    });

    it("defaults givenName/familyName to null when Google omits them", async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "at-1" }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ sub: "sub-1", email: "a@example.com", email_verified: false }),
        });

      const profile = await client.exchangeCodeForProfile("code", "verifier");

      expect(profile.givenName).toBeNull();
      expect(profile.familyName).toBeNull();
      expect(profile.emailVerified).toBe(false);
    });

    it("throws when the token exchange itself fails", async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 400 });

      await expect(client.exchangeCodeForProfile("bad-code", "verifier")).rejects.toThrow(/token exchange failed/);
    });

    it("throws when the userinfo fetch fails", async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "at-1" }) })
        .mockResolvedValueOnce({ ok: false, status: 401 });

      await expect(client.exchangeCodeForProfile("code", "verifier")).rejects.toThrow(/userinfo fetch failed/);
    });
  });
});

describe("PendingOAuthProvider", () => {
  it("throws instead of building a fake authorization URL", () => {
    const provider = new PendingOAuthProvider();
    expect(() => provider.createAuthorizationRequest()).toThrow(ServiceUnavailableException);
  });

  it("throws instead of pretending to exchange a code", async () => {
    const provider = new PendingOAuthProvider();
    await expect(provider.exchangeCodeForProfile()).rejects.toThrow(ServiceUnavailableException);
  });
});
