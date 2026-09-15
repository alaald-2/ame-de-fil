import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { Address } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";
import type { CreateAddressInput } from "./dto/create-address.dto.ts";
import type { UpdateAddressInput } from "./dto/update-address.dto.ts";
import type { AddressResponse, ListAddressesResponse } from "./dto/address-responses.ts";

const NOT_FOUND = () =>
  new NotFoundException({ error: "AddressNotFound", message: "Address not found" });

// A browsing/hygiene concern, not a business rule — same reasoning as
// pagination.schema.ts's own page-size cap: keeps one caller from forcing
// unbounded row growth, nothing more.
const MAX_ADDRESSES_PER_USER = 20;

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async listMyAddresses(userId: string): Promise<ListAddressesResponse> {
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return { items: addresses.map((address) => this.toResponse(address)) };
  }

  async getMyAddress(userId: string, addressId: string): Promise<AddressResponse> {
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address || address.userId !== userId) throw NOT_FOUND();
    return this.toResponse(address);
  }

  // The first address a customer ever saves is forced default regardless of
  // what the client sent — never leave a customer with zero default
  // addresses (the invariant this whole module maintains: whenever >=1
  // address exists, exactly one is always the default — design discussion,
  // docs/plans). Every subsequent create only becomes the default if asked.
  async createAddress(userId: string, input: CreateAddressInput): Promise<AddressResponse> {
    const existingCount = await this.prisma.address.count({ where: { userId } });
    if (existingCount >= MAX_ADDRESSES_PER_USER) {
      throw new UnprocessableEntityException({
        error: "AddressLimitReached",
        message: `You can save at most ${MAX_ADDRESSES_PER_USER} addresses`,
      });
    }

    const shouldBeDefault = existingCount === 0 || input.isDefault === true;

    const address = await this.prisma.$transaction(async (tx) => {
      if (shouldBeDefault) {
        await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      }
      return tx.address.create({
        data: {
          userId,
          label: input.label || null,
          name: input.name,
          line1: input.line1,
          line2: input.line2 || null,
          postalCode: input.postalCode,
          city: input.city,
          country: "SE",
          phone: input.phone || null,
          isDefault: shouldBeDefault,
        },
      });
    });

    return this.toResponse(address);
  }

  // isDefault can only ever arrive as `true` here (updateAddressSchema's own
  // z.literal(true).optional()) — "unsetting" a default is never a request
  // this method has to reason about at all, only "a different address
  // becoming the new one," which is exactly the same transactional
  // unset-others-then-set idiom createAddress already uses.
  async updateAddress(
    userId: string,
    addressId: string,
    input: UpdateAddressInput,
  ): Promise<AddressResponse> {
    const existing = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!existing || existing.userId !== userId) throw NOT_FOUND();

    const address = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault === true) {
        await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      }
      return tx.address.update({
        where: { id: addressId },
        data: {
          ...(input.label !== undefined ? { label: input.label || null } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.line1 !== undefined ? { line1: input.line1 } : {}),
          ...(input.line2 !== undefined ? { line2: input.line2 || null } : {}),
          ...(input.postalCode !== undefined ? { postalCode: input.postalCode } : {}),
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
          ...(input.isDefault === true ? { isDefault: true } : {}),
        },
      });
    });

    return this.toResponse(address);
  }

  // No FK from Order to Address (orders snapshot address fields directly —
  // schema.prisma's own comment on Order's shipping*/billing* columns), so
  // deletion is always unconditionally safe, unlike e.g. product deletion.
  // When the deleted row was the default and others remain, the same
  // transaction promotes the most-recently-created remaining one — the
  // invariant (exactly one default whenever >=1 address exists) must hold
  // on the far side of a delete too, not just after create/update.
  async deleteAddress(userId: string, addressId: string): Promise<void> {
    const existing = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!existing || existing.userId !== userId) throw NOT_FOUND();

    await this.prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id: addressId } });

      if (existing.isDefault) {
        const nextDefault = await tx.address.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
        });
        if (nextDefault) {
          await tx.address.update({ where: { id: nextDefault.id }, data: { isDefault: true } });
        }
      }
    });
  }

  private toResponse(address: Address): AddressResponse {
    return {
      id: address.id,
      label: address.label,
      name: address.name,
      line1: address.line1,
      line2: address.line2,
      postalCode: address.postalCode,
      city: address.city,
      country: "SE",
      phone: address.phone,
      isDefault: address.isDefault,
      createdAt: address.createdAt.toISOString(),
      updatedAt: address.updatedAt.toISOString(),
    };
  }
}
