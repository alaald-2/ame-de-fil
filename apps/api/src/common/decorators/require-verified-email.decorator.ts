import { SetMetadata } from "@nestjs/common";

export const REQUIRE_VERIFIED_EMAIL_KEY = "requireVerifiedEmail";

// Opt-in, same shape as @RequirePermissions() — a route without this
// decorator is unaffected. Applied only to checkout's initiate() endpoint:
// an authenticated customer who hasn't verified their (password-set) email
// can still log in, browse, and see /account, just not check out
// (EmailVerifiedGuard). A guest (@OptionalAuth() with no session at all) is
// never affected by this — there's no email to verify yet.
export const RequireVerifiedEmail = (): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_VERIFIED_EMAIL_KEY, true);
