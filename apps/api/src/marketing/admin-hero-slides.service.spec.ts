import { describe, expect, it, vi } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AdminHeroSlidesService } from "./admin-hero-slides.service.ts";
import type { PrismaService } from "../database/prisma.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import type { ImageStorageProvider } from "../images/image-storage.provider.ts";

const ACTOR_USER_ID = "user-1";

function makeImageStorageMock(): ImageStorageProvider {
  return {
    upload: vi.fn().mockResolvedValue({ url: "https://res.cloudinary.com/x/hero.jpg", publicId: "hero-1" }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function makeTxMock() {
  return {
    heroSlide: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "slide-1", ...data }),
      ),
      update: vi.fn().mockImplementation(({ where, data }: { where: { id: string }; data: unknown }) =>
        Promise.resolve({ id: where.id, ...(data as object) }),
      ),
      delete: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
}

function makePrismaMock(tx: ReturnType<typeof makeTxMock>, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    heroSlide: {
      aggregate: vi.fn().mockResolvedValue({ _max: { position: null } }),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      ...overrides,
    },
    $transaction: vi.fn().mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaService;
}

describe("AdminHeroSlidesService.upload", () => {
  it("rejects an unsupported mime type before ever calling imageStorage", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const imageStorage = makeImageStorageMock();
    const service = new AdminHeroSlidesService(prisma, new AuditService(prisma), imageStorage);

    await expect(
      service.upload({ buffer: Buffer.from("x"), mimetype: "image/gif" }, {}, ACTOR_USER_ID),
    ).rejects.toThrow(BadRequestException);
    expect(imageStorage.upload).not.toHaveBeenCalled();
  });

  it("rejects a file over 5MB before ever calling imageStorage", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const imageStorage = makeImageStorageMock();
    const service = new AdminHeroSlidesService(prisma, new AuditService(prisma), imageStorage);

    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
    await expect(
      service.upload({ buffer: oversized, mimetype: "image/jpeg" }, {}, ACTOR_USER_ID),
    ).rejects.toThrow(BadRequestException);
    expect(imageStorage.upload).not.toHaveBeenCalled();
  });

  it("uploads under the hero-slides Cloudinary folder and appends at the next position", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx, {
      aggregate: vi.fn().mockResolvedValue({ _max: { position: 2 } }),
    });
    const imageStorage = makeImageStorageMock();
    const service = new AdminHeroSlidesService(prisma, new AuditService(prisma), imageStorage);

    const result = await service.upload(
      { buffer: Buffer.from("x"), mimetype: "image/jpeg" },
      { ctaLabelSv: "Handla nu", ctaLabelEn: "Shop now", ctaHref: "/shop" },
      ACTOR_USER_ID,
    );

    expect(imageStorage.upload).toHaveBeenCalledWith(expect.any(Buffer), { folder: "hero-slides" });
    expect(tx.heroSlide.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        imageUrl: "https://res.cloudinary.com/x/hero.jpg",
        cloudinaryPublicId: "hero-1",
        position: 3,
        ctaLabelSv: "Handla nu",
        ctaLabelEn: "Shop now",
        ctaHref: "/shop",
      }),
    });
    expect(result).toMatchObject({ id: "slide-1", position: 3 });
  });
});

describe("AdminHeroSlidesService.reorder", () => {
  it("rejects a list that isn't exactly the current slide set", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx, {
      findMany: vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]),
    });
    const service = new AdminHeroSlidesService(prisma, new AuditService(prisma), makeImageStorageMock());

    await expect(service.reorder(["a"], ACTOR_USER_ID)).rejects.toThrow(BadRequestException);
    expect(tx.heroSlide.update).not.toHaveBeenCalled();
  });

  it("assigns position from array order when the list matches exactly", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx, {
      findMany: vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]),
    });
    const service = new AdminHeroSlidesService(prisma, new AuditService(prisma), makeImageStorageMock());

    await service.reorder(["b", "a"], ACTOR_USER_ID);

    expect(tx.heroSlide.update).toHaveBeenCalledWith({ where: { id: "b" }, data: { position: 0 } });
    expect(tx.heroSlide.update).toHaveBeenCalledWith({ where: { id: "a" }, data: { position: 1 } });
  });
});

describe("AdminHeroSlidesService.update", () => {
  it("404s when the slide doesn't exist", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const service = new AdminHeroSlidesService(prisma, new AuditService(prisma), makeImageStorageMock());

    await expect(service.update("missing", { isActive: false }, ACTOR_USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("patches only the fields provided", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx, {
      findUnique: vi.fn().mockResolvedValue({
        id: "slide-1",
        ctaLabelSv: "Gammal",
        ctaLabelEn: "Old",
        ctaHref: "/old",
        isActive: true,
      }),
    });
    const service = new AdminHeroSlidesService(prisma, new AuditService(prisma), makeImageStorageMock());

    await service.update("slide-1", { isActive: false }, ACTOR_USER_ID);

    expect(tx.heroSlide.update).toHaveBeenCalledWith({ where: { id: "slide-1" }, data: { isActive: false } });
  });
});

describe("AdminHeroSlidesService.delete", () => {
  it("deletes the Cloudinary asset before the row when one exists", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx, {
      findUnique: vi.fn().mockResolvedValue({ id: "slide-1", cloudinaryPublicId: "hero-1" }),
    });
    const imageStorage = makeImageStorageMock();
    const service = new AdminHeroSlidesService(prisma, new AuditService(prisma), imageStorage);

    await service.delete("slide-1", ACTOR_USER_ID);

    expect(imageStorage.delete).toHaveBeenCalledWith("hero-1");
    expect(tx.heroSlide.delete).toHaveBeenCalledWith({ where: { id: "slide-1" } });
  });

  it("404s when the slide doesn't exist, and never calls imageStorage", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const imageStorage = makeImageStorageMock();
    const service = new AdminHeroSlidesService(prisma, new AuditService(prisma), imageStorage);

    await expect(service.delete("missing", ACTOR_USER_ID)).rejects.toThrow(NotFoundException);
    expect(imageStorage.delete).not.toHaveBeenCalled();
  });
});
