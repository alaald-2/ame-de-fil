-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "madeToOrder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "productionTimeDaysSnapshot" INTEGER;
