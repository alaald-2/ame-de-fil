-- CreateEnum
CREATE TYPE "HomepageSectionKey" AS ENUM ('STORY', 'MADE_TO_ORDER');

-- CreateTable
CREATE TABLE "HomepageSection" (
    "key" "HomepageSectionKey" NOT NULL,
    "imageUrl" TEXT,
    "cloudinaryPublicId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomepageSection_pkey" PRIMARY KEY ("key")
);
