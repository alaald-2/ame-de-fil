-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "pickupPointAddress" TEXT,
ADD COLUMN     "pickupPointId" TEXT,
ADD COLUMN     "pickupPointName" TEXT,
ADD COLUMN     "shippingMethodNameSnapshot" TEXT;

-- AlterTable
ALTER TABLE "ShippingMethod" ADD COLUMN     "requiresPickupPoint" BOOLEAN NOT NULL DEFAULT false;
