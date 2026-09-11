import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v2 as cloudinary } from "cloudinary";
import type { Env } from "@ame-de-fil/config";

// Provider-agnostic dispatch boundary (mirrors EmailProvider/PaymentProvider
// — DECISIONS.md ADR-034/ADR-031/ADR-014): callers depend only on this,
// never on the cloudinary SDK directly.
export const IMAGE_STORAGE_PROVIDER = Symbol("IMAGE_STORAGE_PROVIDER");

export interface UploadedImage {
  url: string;
  publicId: string;
}

export interface ImageStorageProvider {
  upload(buffer: Buffer, options: { productId: string }): Promise<UploadedImage>;
  delete(publicId: string): Promise<void>;
}

@Injectable()
export class CloudinaryImageStorageProvider implements ImageStorageProvider {
  constructor(config: ConfigService<Env, true>) {
    cloudinary.config({
      cloud_name: config.get("CLOUDINARY_CLOUD_NAME", { infer: true }),
      api_key: config.get("CLOUDINARY_API_KEY", { infer: true }),
      api_secret: config.get("CLOUDINARY_API_SECRET", { infer: true }),
    });
  }

  async upload(buffer: Buffer, options: { productId: string }): Promise<UploadedImage> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `ame-de-fil/products/${options.productId}`, resource_type: "image" },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error("Cloudinary upload returned no result"));
            return;
          }
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );
      stream.end(buffer);
    });
  }

  async delete(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }
}

// Fallback when Cloudinary isn't configured — the same "disclosed, not
// faked" posture as PendingEmailProvider/PendingPaymentProvider: it never
// pretends to store an image, it throws a clear 503 so local dev without
// Cloudinary credentials still boots and every other product edit still
// works, just without image upload.
@Injectable()
export class PendingImageStorageProvider implements ImageStorageProvider {
  private readonly logger = new Logger(PendingImageStorageProvider.name);

  async upload(): Promise<UploadedImage> {
    this.logger.warn("No image storage provider configured (CLOUDINARY_* unset) — upload rejected");
    throw new ServiceUnavailableException({
      error: "ImageStorageNotConfigured",
      message: "Image storage is not configured on this environment",
    });
  }

  async delete(): Promise<void> {
    this.logger.warn("No image storage provider configured (CLOUDINARY_* unset) — delete rejected");
    throw new ServiceUnavailableException({
      error: "ImageStorageNotConfigured",
      message: "Image storage is not configured on this environment",
    });
  }
}
