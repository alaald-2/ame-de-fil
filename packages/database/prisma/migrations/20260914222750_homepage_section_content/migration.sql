-- AlterEnum
ALTER TYPE "HomepageSectionKey" ADD VALUE 'HERO';

-- AlterTable
ALTER TABLE "HomepageSection" ADD COLUMN     "ctaHref" TEXT,
ADD COLUMN     "ctaLabelEn" TEXT,
ADD COLUMN     "ctaLabelSv" TEXT,
ADD COLUMN     "descriptionEn" TEXT,
ADD COLUMN     "descriptionSv" TEXT,
ADD COLUMN     "eyebrowEn" TEXT,
ADD COLUMN     "eyebrowSv" TEXT,
ADD COLUMN     "titleEn" TEXT,
ADD COLUMN     "titleSv" TEXT;

