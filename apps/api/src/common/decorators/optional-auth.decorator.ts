import { SetMetadata } from "@nestjs/common";

export const OPTIONAL_AUTH_KEY = "optionalAuth";

// For routes that must work for both anonymous and authenticated callers
// (cart: guest carts by token, customer carts by session — SECURITY.md §2's
// object-level authorization still applies once a caller *is*
// authenticated, this only changes whether authentication is required at
// all). Distinct from @Public(): a public route never populates
// request.auth even if a valid session cookie is present; this one does,
// whenever one is, without rejecting the request when it's absent or invalid.
export const OptionalAuth = (): MethodDecorator & ClassDecorator =>
  SetMetadata(OPTIONAL_AUTH_KEY, true);
