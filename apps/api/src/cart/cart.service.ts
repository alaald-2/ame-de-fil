import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ProductStatus } from "@ame-de-fil/database";
import type { Locale as AppLocale } from "@ame-de-fil/validation";
import { DEFAULT_LOCALE } from "@ame-de-fil/validation";
import { PrismaService } from "../database/prisma.service.ts";
import { computeAvailability } from "../common/inventory-availability.ts";
import { resolveActivePromotionsForVariants } from "../promotions/effective-price.ts";
import {
  CART_INCLUDE,
  emptyCartResponse,
  mapCart,
  type CartWithItems,
} from "./mappers/cart.mapper.ts";
import type { CartResponse } from "./dto/responses.ts";
import { cartIdentityWhere, type CartIdentity } from "../common/cart-identity.ts";
import type { AddItemInput } from "./dto/add-item.dto.ts";

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  // Read-only: never creates a Cart row or a cookie. A visitor who has
  // never added anything gets the static empty shape, not a persisted cart.
  async getCart(identity: CartIdentity, locale: AppLocale): Promise<CartResponse> {
    const cart = await this.prisma.cart.findUnique({
      where: cartIdentityWhere(identity),
      include: CART_INCLUDE,
    });
    if (!cart) return emptyCartResponse();

    const promotions = await this.resolvePromotionsFor(cart);
    return mapCart(cart, locale, DEFAULT_LOCALE, promotions);
  }

  // The only mutation allowed to bring a Cart row into existence — the
  // controller has already minted a guest-cart cookie for `identity` by the
  // time this runs, if the caller was a fresh anonymous visitor.
  async addItem(
    identity: CartIdentity,
    input: AddItemInput,
    locale: AppLocale,
  ): Promise<CartResponse> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: input.variantId },
      include: { product: true, inventoryItem: true },
    });

    if (!variant || !variant.isActive || variant.product.status !== ProductStatus.PUBLISHED) {
      throw new BadRequestException({
        error: "InvalidVariant",
        message: `Variant "${input.variantId}" does not exist or is not available for purchase`,
      });
    }

    const availability = variant.inventoryItem
      ? computeAvailability(variant.inventoryItem)
      : { available: false, availableQuantity: 0 };
    if (!availability.available) {
      throw new BadRequestException({
        error: "OutOfStock",
        message: `Variant "${input.variantId}" is currently out of stock`,
      });
    }

    const cart = await this.prisma.cart.upsert({
      where: cartIdentityWhere(identity),
      create: identity,
      update: {},
    });

    const existingItem = await this.prisma.cartItem.findUnique({
      where: { cartId_productVariantId: { cartId: cart.id, productVariantId: variant.id } },
    });
    const newQuantity = (existingItem?.quantity ?? 0) + input.quantity;

    if (availability.availableQuantity !== null && newQuantity > availability.availableQuantity) {
      throw new BadRequestException({
        error: "InsufficientStock",
        message: `Only ${availability.availableQuantity} unit(s) of "${variant.sku ?? variant.articleNumber}" available`,
        availableQuantity: availability.availableQuantity,
      });
    }

    // The increment itself is atomic at the DB level (never a stale
    // read-then-overwrite), so a duplicate/double-click add can't drop a
    // unit even if two requests' `existingItem` reads above interleave —
    // `newQuantity`/the availability check above is a best-effort guard
    // only, consistent with add-to-cart never being a hard reservation
    // (checkpoint scope: real oversell prevention is checkout's job later).
    await this.prisma.cartItem.upsert({
      where: { cartId_productVariantId: { cartId: cart.id, productVariantId: variant.id } },
      create: { cartId: cart.id, productVariantId: variant.id, quantity: input.quantity },
      update: { quantity: { increment: input.quantity } },
    });

    return this.getCartOrThrow(cart.id, locale);
  }

  async updateItemQuantity(
    identity: CartIdentity,
    itemId: string,
    quantity: number,
    locale: AppLocale,
  ): Promise<CartResponse> {
    const cart = await this.requireOwnedCart(identity);
    const item = await this.requireOwnedItem(cart.id, itemId);

    const availability = item.variant.inventoryItem
      ? computeAvailability(item.variant.inventoryItem)
      : { available: false, availableQuantity: 0 };
    if (availability.availableQuantity !== null && quantity > availability.availableQuantity) {
      throw new BadRequestException({
        error: "InsufficientStock",
        message: `Only ${availability.availableQuantity} unit(s) of "${item.variant.sku ?? item.variant.articleNumber}" available`,
        availableQuantity: availability.availableQuantity,
      });
    }

    await this.prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
    return this.getCartOrThrow(cart.id, locale);
  }

  async removeItem(
    identity: CartIdentity,
    itemId: string,
    locale: AppLocale,
  ): Promise<CartResponse> {
    const cart = await this.requireOwnedCart(identity);
    await this.requireOwnedItem(cart.id, itemId);

    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return this.getCartOrThrow(cart.id, locale);
  }

  // Ownership boundary: an item id only resolves within *this* identity's
  // own cart (scoped by cartId, not just by itemId) — never across carts,
  // so one visitor's item id can't be used to probe or mutate another
  // visitor's cart (checkpoint's authorization requirement).
  private async requireOwnedCart(identity: CartIdentity) {
    const cart = await this.prisma.cart.findUnique({ where: cartIdentityWhere(identity) });
    if (!cart) {
      throw new NotFoundException({ error: "CartNotFound", message: "No cart found" });
    }
    return cart;
  }

  private async requireOwnedItem(cartId: string, itemId: string) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId },
      include: { variant: { include: { inventoryItem: true } } },
    });
    if (!item) {
      throw new NotFoundException({
        error: "CartItemNotFound",
        message: "No such item in this cart",
      });
    }
    return item;
  }

  private async getCartOrThrow(cartId: string, locale: AppLocale): Promise<CartResponse> {
    const cart = (await this.prisma.cart.findUniqueOrThrow({
      where: { id: cartId },
      include: CART_INCLUDE,
    })) as CartWithItems;
    const promotions = await this.resolvePromotionsFor(cart);
    return mapCart(cart, locale, DEFAULT_LOCALE, promotions);
  }

  // Resolved fresh on every read, exactly like variant.priceMinor itself —
  // a promotion starting, expiring, or being deactivated between two cart
  // reads is reflected immediately on the next one, with nothing ever
  // cached on the CartItem row (mapCart's own comment has the fuller
  // rationale, shared with the price it computes from this).
  private async resolvePromotionsFor(cart: CartWithItems) {
    const variantIds = cart.items.map((item) => item.variant.id);
    return resolveActivePromotionsForVariants(this.prisma, variantIds, new Date());
  }
}
