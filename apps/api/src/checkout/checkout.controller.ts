import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Headers,
  Post,
  Req,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { OptionalAuth } from "../common/decorators/optional-auth.decorator.ts";
import { RequireVerifiedEmail } from "../common/decorators/require-verified-email.decorator.ts";
import { CurrentUser } from "../common/decorators/current-user.decorator.ts";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { toOpenApiSchema } from "../common/zod-openapi.ts";
import { resolveCartIdentity } from "../common/cart-identity.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { CheckoutService } from "./checkout.service.ts";
import { initiateCheckoutSchema, type InitiateCheckoutInput } from "./dto/initiate-checkout.dto.ts";
import { checkoutResponseSchema } from "./dto/responses.ts";

const IDEMPOTENCY_KEY_HEADER = "idempotency-key";

// @OptionalAuth() — guest checkout is a real, supported flow (Order.userId
// is nullable, Order.guestEmail exists for exactly this): checkout reads
// the *caller's own* cart (guest-cookie or session, same resolution as
// cart.controller.ts), it never accepts cart contents from the client.
@ApiTags("checkout")
@ApiCookieAuth("ame_session")
@Controller("checkout")
@OptionalAuth()
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Per-IP, not per-account — a guest checkout has no account to key on,
  // and this must cover both. 10/min is deliberately looser than login's
  // 5/min: a real customer's own retries (a declined card, a slow 3DS step)
  // are a normal part of one checkout attempt, each carrying its own
  // Idempotency-Key (SECURITY.md §4 names checkout submission explicitly;
  // this was the one item on that list left unwired).
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ windowMs: 60_000, max: 10 })
  // A logged-in customer who hasn't verified their (password-set) email
  // gets a distinct 403 EmailNotVerified here — never applies to a guest
  // caller (EmailVerifiedGuard no-ops when request.auth is undefined).
  @RequireVerifiedEmail()
  @ApiOperation({ summary: "Initiate checkout from the caller's own current cart" })
  @ApiHeader({ name: IDEMPOTENCY_KEY_HEADER, required: true })
  @ApiBody({ schema: toOpenApiSchema(initiateCheckoutSchema) })
  @ApiCreatedResponse({ schema: toOpenApiSchema(checkoutResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 409, 429)
  async initiate(
    @Req() request: Request,
    @CurrentUser() auth: AuthContext | undefined,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(initiateCheckoutSchema)) body: InitiateCheckoutInput,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException({
        error: "IdempotencyKeyRequired",
        message: `The "${IDEMPOTENCY_KEY_HEADER}" header is required`,
      });
    }

    const cookieName = this.config.get("CART_COOKIE_NAME", { infer: true });
    const identity = resolveCartIdentity(auth, request, cookieName);
    if (!identity) {
      throw new BadRequestException({ error: "EmptyCart", message: "Your cart is empty" });
    }

    return this.checkout.initiate(identity, auth, idempotencyKey, body);
  }
}
