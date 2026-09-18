import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { REQUIRED_PERMISSIONS_KEY } from "../decorators/require-permissions.decorator.ts";

// Runs after SessionAuthGuard. A route with no @RequirePermissions is
// reachable by any authenticated user; one that declares permissions
// requires the caller to hold every one of them (SECURITY.md §2).
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const granted = new Set(request.auth?.permissions ?? []);
    return required.every((permission) => granted.has(permission));
  }
}
