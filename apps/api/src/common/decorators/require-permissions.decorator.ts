import { SetMetadata } from "@nestjs/common";

export const REQUIRED_PERMISSIONS_KEY = "requiredPermissions";

// Allow-list, not deny-list (SECURITY.md §2): a route without this decorator
// is reachable by any authenticated user; PermissionsGuard only restricts
// routes that explicitly opt in, e.g. `@RequirePermissions("orders.refund")`.
export const RequirePermissions = (...permissions: string[]): MethodDecorator =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
