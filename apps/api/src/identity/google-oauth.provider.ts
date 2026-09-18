import { createHash, randomBytes } from "node:crypto";
import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

// Provider-agnostic-in-spirit boundary, mirroring PaymentProvider/
// EmailProvider (DECISIONS.md ADR-014/ADR-031) — AuthController/AuthService
// depend only on this, never on Google's endpoints directly. Deliberately
// Google-specific rather than a generic "OAuthProvider" interface: only one
// provider is being built (ADR-033), and generalizing for a hypothetical
// second one now would be designing for a requirement that doesn't exist
// yet (the same restraint PaymentProvider's own comment already applies to
// refund()/getStatus()).
export const GOOGLE_OAUTH_PROVIDER = Symbol("GOOGLE_OAUTH_PROVIDER");

export interface GoogleAuthorizationRequest {
  url: string;
  state: string;
  codeVerifier: string;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  givenName: string | null;
  familyName: string | null;
}

export interface GoogleOAuthProvider {
  createAuthorizationRequest(): GoogleAuthorizationRequest;
  exchangeCodeForProfile(code: string, codeVerifier: string): Promise<GoogleProfile>;
}

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

interface GoogleTokenResponse {
  access_token: string;
}

interface GoogleUserinfoResponse {
  sub: string;
  email: string;
  email_verified: boolean;
  given_name?: string;
  family_name?: string;
}

// Plain REST calls against Google's own OAuth/OIDC endpoints — no
// `googleapis` SDK dependency (heavy, and this needs three HTTP calls, not
// a client library). Authorization Code flow with PKCE (RFC 7636): PKCE
// matters here specifically because there is no session yet to bind the
// flow to — `code_verifier`/`code_challenge` plus the `state` value
// (compared against a cookie in auth.controller.ts) are the only two
// things standing between "a stolen/replayed authorization code" and
// "nothing useful happens with it."
//
// Deliberately calls the userinfo endpoint with the access token rather
// than verifying the ID token's JWT signature against Google's JWKS —
// simpler, and avoids adding a JWT-verification library for the one call
// site that needs it; the access token itself was only just issued by
// Google's own token endpoint over a server-to-server TLS connection, so
// there is nothing for local signature verification to add here that
// Google hasn't already guaranteed by handing it back.
@Injectable()
export class GoogleOAuthClient implements GoogleOAuthProvider {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
  ) {}

  createAuthorizationRequest(): GoogleAuthorizationRequest {
    const state = randomBytes(24).toString("base64url");
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    return { url: `${AUTHORIZATION_ENDPOINT}?${params.toString()}`, state, codeVerifier };
  }

  async exchangeCodeForProfile(code: string, codeVerifier: string): Promise<GoogleProfile> {
    const tokenResponse = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: this.redirectUri,
      }),
    });
    if (!tokenResponse.ok) {
      throw new Error(`Google token exchange failed with status ${tokenResponse.status}`);
    }
    const tokens = (await tokenResponse.json()) as GoogleTokenResponse;

    const profileResponse = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) {
      throw new Error(`Google userinfo fetch failed with status ${profileResponse.status}`);
    }
    const profile = (await profileResponse.json()) as GoogleUserinfoResponse;

    return {
      sub: profile.sub,
      email: profile.email,
      emailVerified: profile.email_verified,
      givenName: profile.given_name ?? null,
      familyName: profile.family_name ?? null,
    };
  }
}

// Fallback when Google isn't configured — the same "disclosed, not faked"
// posture as PendingPaymentProvider/PendingEmailProvider: never redirects
// anywhere fake, throws a clear, specific error instead.
@Injectable()
export class PendingOAuthProvider implements GoogleOAuthProvider {
  private readonly logger = new Logger(PendingOAuthProvider.name);

  createAuthorizationRequest(): never {
    this.logger.warn(
      "Google sign-in requested but not configured (GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI unset)",
    );
    throw new ServiceUnavailableException({
      error: "OAuthNotConfigured",
      message: "Google sign-in is not configured",
    });
  }

  async exchangeCodeForProfile(): Promise<never> {
    throw new ServiceUnavailableException({
      error: "OAuthNotConfigured",
      message: "Google sign-in is not configured",
    });
  }
}
