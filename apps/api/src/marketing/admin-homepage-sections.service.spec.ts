import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { HomepageSectionKey } from "@ame-de-fil/database";
import { AdminHomepageSectionsService } from "./admin-homepage-sections.service.ts";
import type { PrismaService } from "../database/prisma.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import type { ImageStorageProvider } from "../images/image-storage.provider.ts";

const ACTOR_USER_ID = "user-1";

function makeImageStorageMock(): ImageStorageProvider {
  return {
    upload: vi.fn().mockResolvedValue({ url: "https://res.cloudinary.com/x/section.jpg", publicId: "section-1" }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function makeTxMock() {
  return {
    homepageSection: {
      upsert: vi.fn().mockImplementation(
        ({ where, update, create }: { where: { key: HomepageSectionKey }; update: unknown; create: unknown }) =>
          Promise.resolve({ key: where.key, ...(update ?? create) as object }),
      ),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
}

function makePrismaMock(tx: ReturnType<typeof makeTxMock>, findUniqueResult: unknown = null) {
  return {
    homepageSection: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(findUniqueResult),
    },
    $transaction: vi.fn().mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaService;
}

const EMPTY_SECTION = {
  imageUrl: null,
  eyebrowSv: null,
  eyebrowEn: null,
  titleSv: null,
  titleEn: null,
  descriptionSv: null,
  descriptionEn: null,
  ctaLabelSv: null,
  ctaLabelEn: null,
  ctaHref: null,
};

describe("AdminHomepageSectionsService.list", () => {
  it("returns all three known slots even when no rows exist yet", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const service = new AdminHomepageSectionsService(prisma, new AuditService(prisma), makeImageStorageMock());

    const result = await service.list();

    expect(result).toEqual([
      { key: "hero", ...EMPTY_SECTION },
      { key: "story", ...EMPTY_SECTION },
      { key: "made-to-order", ...EMPTY_SECTION },
      { key: "announcement", ...EMPTY_SECTION },
    ]);
  });
});

describe("AdminHomepageSectionsService.uploadImage", () => {
  it("rejects an unsupported mime type before ever calling imageStorage", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const imageStorage = makeImageStorageMock();
    const service = new AdminHomepageSectionsService(prisma, new AuditService(prisma), imageStorage);

    await expect(
      service.uploadImage("story", { buffer: Buffer.from("x"), mimetype: "image/gif" }, ACTOR_USER_ID),
    ).rejects.toThrow(BadRequestException);
    expect(imageStorage.upload).not.toHaveBeenCalled();
  });

  it("uploads under the homepage-sections Cloudinary folder", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const imageStorage = makeImageStorageMock();
    const service = new AdminHomepageSectionsService(prisma, new AuditService(prisma), imageStorage);

    const result = await service.uploadImage("made-to-order", { buffer: Buffer.from("x"), mimetype: "image/jpeg" }, ACTOR_USER_ID);

    expect(imageStorage.upload).toHaveBeenCalledWith(expect.any(Buffer), { folder: "homepage-sections" });
    expect(tx.homepageSection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: HomepageSectionKey.MADE_TO_ORDER } }),
    );
    expect(result).toEqual({
      key: "made-to-order",
      ...EMPTY_SECTION,
      imageUrl: "https://res.cloudinary.com/x/section.jpg",
    });
  });

  it("deletes the previous Cloudinary asset only after the new one uploads successfully", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx, { key: HomepageSectionKey.STORY, imageUrl: "old", cloudinaryPublicId: "old-1" });
    const imageStorage = makeImageStorageMock();
    const service = new AdminHomepageSectionsService(prisma, new AuditService(prisma), imageStorage);

    await service.uploadImage("story", { buffer: Buffer.from("x"), mimetype: "image/jpeg" }, ACTOR_USER_ID);

    expect(imageStorage.delete).toHaveBeenCalledWith("old-1");
    const uploadOrder = imageStorage.upload.mock.invocationCallOrder[0]!;
    const deleteOrder = imageStorage.delete.mock.invocationCallOrder[0]!;
    expect(uploadOrder).toBeLessThan(deleteOrder);
  });
});

describe("AdminHomepageSectionsService.deleteImage", () => {
  it("deletes the Cloudinary asset and clears the row", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx, { key: HomepageSectionKey.STORY, imageUrl: "old", cloudinaryPublicId: "old-1" });
    const imageStorage = makeImageStorageMock();
    const service = new AdminHomepageSectionsService(prisma, new AuditService(prisma), imageStorage);

    const result = await service.deleteImage("story", ACTOR_USER_ID);

    expect(imageStorage.delete).toHaveBeenCalledWith("old-1");
    expect(tx.homepageSection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { imageUrl: null, cloudinaryPublicId: null } }),
    );
    expect(result).toEqual({ key: "story", ...EMPTY_SECTION });
  });

  it("does nothing to imageStorage when the slot has no image yet", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx, null);
    const imageStorage = makeImageStorageMock();
    const service = new AdminHomepageSectionsService(prisma, new AuditService(prisma), imageStorage);

    await service.deleteImage("made-to-order", ACTOR_USER_ID);

    expect(imageStorage.delete).not.toHaveBeenCalled();
  });
});

describe("AdminHomepageSectionsService.updateContent", () => {
  it("creates a row (upsert) when the section has never been edited before", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx, null);
    const service = new AdminHomepageSectionsService(prisma, new AuditService(prisma), makeImageStorageMock());

    const result = await service.updateContent(
      "hero",
      { titleSv: "Ny rubrik", titleEn: "New heading" },
      ACTOR_USER_ID,
    );

    expect(tx.homepageSection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: HomepageSectionKey.HERO },
        update: expect.objectContaining({ titleSv: "Ny rubrik", titleEn: "New heading" }),
      }),
    );
    // toMatchObject, not toEqual — the tx mock's create-branch echo doesn't
    // simulate Postgres defaulting an unset nullable column to NULL the way
    // a real upsert's returned row would, only the fields updateContent
    // itself set are worth asserting here.
    expect(result).toMatchObject({ key: "hero", titleSv: "Ny rubrik", titleEn: "New heading" });
  });

  it("treats an empty string as clearing a field back to the default (null), and an omitted key as unchanged", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx, {
      key: HomepageSectionKey.STORY,
      titleSv: "Gammal rubrik",
      titleEn: "Old heading",
    });
    const service = new AdminHomepageSectionsService(prisma, new AuditService(prisma), makeImageStorageMock());

    await service.updateContent("story", { titleSv: "" }, ACTOR_USER_ID);

    expect(tx.homepageSection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ titleSv: null, titleEn: undefined }),
      }),
    );
  });
});
