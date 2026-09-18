import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { AuthContext } from "../types/auth-context.ts";

// `@CurrentUser() auth: AuthContext` in a controller method. Requires
// SessionAuthGuard to have run first (request.auth is undefined on
// @Public() routes) — see PermissionsGuard for the read-order this depends on.
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.auth;
  },
);
