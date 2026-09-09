import { SetMetadata } from "@nestjs/common";

export const SKIP_CSRF_KEY = "skipCsrf";

// For routes that aren't cookie-authenticated (e.g. a future Stripe webhook
// controller, verified by signature instead — SECURITY.md §3/§6).
export const SkipCsrf = (): MethodDecorator & ClassDecorator => SetMetadata(SKIP_CSRF_KEY, true);
