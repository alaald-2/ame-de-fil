import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import type { UpdateStoreSettingsInput } from "./dto/update-store-settings.dto.ts";
import type { StoreSettingsResponse } from "./dto/store-settings-response.ts";

const SINGLETON_ID = "singleton";

@Injectable()
export class AdminStoreSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // No natural key for "the one settings row" — pinned to a fixed id and
  // upserted-into-existence on first read, so this never 404s the way a
  // real resource would; there is always exactly one StoreSettings row.
  async get(): Promise<StoreSettingsResponse> {
    const settings = await this.prisma.storeSettings.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      create: { id: SINGLETON_ID },
    });
    return this.map(settings);
  }

  async update(
    input: UpdateStoreSettingsInput,
    actorUserId: string,
    ipAddress?: string,
  ): Promise<StoreSettingsResponse> {
    const before = await this.prisma.storeSettings.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      create: { id: SINGLETON_ID },
    });

    // Only the fields actually present in the request, not the whole row —
    // `updatedAt` (and anything else untouched) would otherwise show up as
    // a "changed" field in every entry purely because it always ticks
    // forward, which is never useful audit information.
    const changedKeys = Object.keys(input) as (keyof UpdateStoreSettingsInput)[];

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.storeSettings.update({ where: { id: SINGLETON_ID }, data: input });

      const beforeSnapshot: Record<string, string | boolean | null> = {};
      const afterSnapshot: Record<string, string | boolean | null> = {};
      for (const key of changedKeys) {
        beforeSnapshot[key] = before[key];
        afterSnapshot[key] = result[key];
      }

      await this.audit.record(
        {
          actorUserId,
          action: "store_settings.updated",
          entityType: "StoreSettings",
          entityId: SINGLETON_ID,
          before: beforeSnapshot,
          after: afterSnapshot,
          ipAddress,
        },
        tx,
      );

      return result;
    });

    return this.map(updated);
  }

  private map(settings: {
    businessName: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    postalCode: string | null;
    city: string | null;
    country: string | null;
    orgNumber: string | null;
    vatNumber: string | null;
    phone: string | null;
    email: string | null;
    showAddress: boolean;
    showOrgNumber: boolean;
    showVatNumber: boolean;
    showPhone: boolean;
    showEmail: boolean;
    updatedAt: Date;
  }): StoreSettingsResponse {
    return {
      businessName: settings.businessName,
      addressLine1: settings.addressLine1,
      addressLine2: settings.addressLine2,
      postalCode: settings.postalCode,
      city: settings.city,
      country: settings.country,
      orgNumber: settings.orgNumber,
      vatNumber: settings.vatNumber,
      phone: settings.phone,
      email: settings.email,
      showAddress: settings.showAddress,
      showOrgNumber: settings.showOrgNumber,
      showVatNumber: settings.showVatNumber,
      showPhone: settings.showPhone,
      showEmail: settings.showEmail,
      updatedAt: settings.updatedAt.toISOString(),
    };
  }
}
