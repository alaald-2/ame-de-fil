import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import {
  IMAGE_STORAGE_PROVIDER,
  PendingImageStorageProvider,
  CloudinaryImageStorageProvider,
  type ImageStorageProvider,
} from "./image-storage.provider.ts";

// IMAGE_STORAGE_PROVIDER resolves to CloudinaryImageStorageProvider when
// Cloudinary is configured, PendingImageStorageProvider (no upload
// attempted) otherwise — the same factory idiom as PAYMENT_PROVIDER/
// EMAIL_PROVIDER (DECISIONS.md ADR-034). CloudinaryImageStorageProvider is
// deliberately not registered as its own standalone provider — Nest would
// eagerly construct it (and its config.get calls would return undefined
// rather than throw, silently misconfiguring the SDK) on every boot,
// defeating the fallback.
//
// Its own top-level module (not a plain provider tucked into CatalogModule,
// which is where this lived when only product images used it) now that a
// second domain — MarketingModule's hero slides — needs the identical
// upload/delete dispatch under a different Cloudinary folder. Exported so
// both modules import this one rather than each wiring its own copy of the
// same factory.
@Module({
  providers: [
    {
      provide: IMAGE_STORAGE_PROVIDER,
      useFactory: (config: ConfigService<Env, true>): ImageStorageProvider => {
        const configured =
          Boolean(config.get("CLOUDINARY_CLOUD_NAME", { infer: true })) &&
          Boolean(config.get("CLOUDINARY_API_KEY", { infer: true })) &&
          Boolean(config.get("CLOUDINARY_API_SECRET", { infer: true }));
        return configured
          ? new CloudinaryImageStorageProvider(config)
          : new PendingImageStorageProvider();
      },
      inject: [ConfigService],
    },
  ],
  exports: [IMAGE_STORAGE_PROVIDER],
})
export class ImagesModule {}
