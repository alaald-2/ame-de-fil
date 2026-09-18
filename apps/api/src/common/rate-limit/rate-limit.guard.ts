import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { RATE_LIMIT_KEY, type RateLimitOptions } from "./rate-limit.decorator.ts";
import { RATE_LIMIT_STORE, type RateLimitStore } from "./rate-limit-store.ts";

// Per-IP by default (SECURITY.md §4); combine with the caller's userId once
// an endpoint has one, by keying on `${ip}:${request.auth.userId}`.
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const key = `${context.getClass().name}:${context.getHandler().name}:${request.ip}`;

    const hit = await this.store.increment(key, options.windowMs);
    if (hit.count > options.max) {
      throw new HttpException("Too many requests", HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
