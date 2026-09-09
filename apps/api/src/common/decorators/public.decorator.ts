import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

// Opts a route out of the default-deny SessionAuthGuard (SECURITY.md §2) —
// e.g. the health endpoint, or AuthController's login endpoint (the one
// route that must be reachable with no session at all).
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
