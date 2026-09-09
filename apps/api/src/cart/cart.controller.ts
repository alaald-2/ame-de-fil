import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import type { Env } from "@ame-de-fil/config";
import { OptionalAuth } from "../common/decorators/optional-auth.decorator.ts";
import { CurrentUser } from "../common/decorators/current-user.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiZodParam, ApiZodQuery, toOpenApiSchema } from "../common/zod-openapi.ts";
import { localeQuerySchema, type LocaleQuery } from "../common/dto/locale-query.schema.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { CartService } from "./cart.service.ts";
import { emptyCartResponse } from "./mappers/cart.mapper.ts";
import { resolveCartIdentity, resolveOrCreateCartIdentity } from "../common/cart-identity.ts";
import { addItemSchema, type AddItemInput } from "./dto/add-item.dto.ts";
import { updateQuantitySchema, type UpdateQuantityInput } from "./dto/update-quantity.dto.ts";
import { itemIdParamSchema, type ItemIdParam } from "./dto/item-id.param.ts";
import { cartResponseSchema } from "./dto/responses.ts";

// @OptionalAuth() throughout — a cart must work for both an anonymous
// visitor (identified by a guest-cart cookie, ARCHITECTURE.md's guest
// checkout requirement) and a signed-in customer (identified by their
// session, restricted to their own cart only). Never @Public(): when a
// session cookie *is* present, SessionAuthGuard still validates it and
// populates request.auth, which the identity resolution below prefers.
@ApiTags("cart")
@ApiCookieAuth("ame_session")
@Controller("cart")
@OptionalAuth()
export class CartController {
  constructor(
    private readonly cart: CartService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get the current cart (guest or signed-in) — never creates one" })
  @ApiZodQuery(localeQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(cartResponseSchema) })
  async getCart(
    @Req() request: Request,
    @CurrentUser() auth: AuthContext | undefined,
    @Query(new ZodValidationPipe(localeQuerySchema)) query: LocaleQuery,
  ) {
    const identity = resolveCartIdentity(auth, request, this.cookieName());
    if (!identity) return emptyCartResponse();
    return this.cart.getCart(identity, query.locale);
  }

  @Post("items")
  @ApiOperation({ summary: "Add a variant to the cart, creating a guest cart cookie if needed" })
  @ApiZodQuery(localeQuerySchema)
  @ApiBody({ schema: toOpenApiSchema(addItemSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(cartResponseSchema) })
  async addItem(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @CurrentUser() auth: AuthContext | undefined,
    @Query(new ZodValidationPipe(localeQuerySchema)) query: LocaleQuery,
    @Body(new ZodValidationPipe(addItemSchema)) body: AddItemInput,
  ) {
    const identity = resolveOrCreateCartIdentity(auth, request, response, {
      cookieName: this.cookieName(),
      ttlDays: this.config.get("CART_COOKIE_TTL_DAYS", { infer: true }),
      secure: this.config.get("NODE_ENV", { infer: true }) === "production",
    });
    return this.cart.addItem(identity, body, query.locale);
  }

  @Patch("items/:itemId")
  @ApiOperation({ summary: "Update a cart line's quantity" })
  @ApiZodParam(itemIdParamSchema)
  @ApiZodQuery(localeQuerySchema)
  @ApiBody({ schema: toOpenApiSchema(updateQuantitySchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(cartResponseSchema) })
  async updateItem(
    @Req() request: Request,
    @CurrentUser() auth: AuthContext | undefined,
    @Param(new ZodValidationPipe(itemIdParamSchema)) params: ItemIdParam,
    @Query(new ZodValidationPipe(localeQuerySchema)) query: LocaleQuery,
    @Body(new ZodValidationPipe(updateQuantitySchema)) body: UpdateQuantityInput,
  ) {
    const identity = this.requireIdentity(auth, request);
    return this.cart.updateItemQuantity(identity, params.itemId, body.quantity, query.locale);
  }

  @Delete("items/:itemId")
  @ApiOperation({ summary: "Remove a line from the cart" })
  @ApiZodParam(itemIdParamSchema)
  @ApiZodQuery(localeQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(cartResponseSchema) })
  async removeItem(
    @Req() request: Request,
    @CurrentUser() auth: AuthContext | undefined,
    @Param(new ZodValidationPipe(itemIdParamSchema)) params: ItemIdParam,
    @Query(new ZodValidationPipe(localeQuerySchema)) query: LocaleQuery,
  ) {
    const identity = this.requireIdentity(auth, request);
    return this.cart.removeItem(identity, params.itemId, query.locale);
  }

  private cookieName(): string {
    return this.config.get("CART_COOKIE_NAME", { infer: true });
  }

  // update/remove can never lazily create a cart — a caller with no
  // resolvable identity at all has nothing to update or remove.
  private requireIdentity(auth: AuthContext | undefined, request: Request) {
    const identity = resolveCartIdentity(auth, request, this.cookieName());
    if (!identity) {
      throw new NotFoundException({ error: "CartNotFound", message: "No cart found" });
    }
    return identity;
  }
}
