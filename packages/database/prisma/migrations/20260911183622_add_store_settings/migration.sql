-- CreateTable
CREATE TABLE "StoreSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "businessName" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "country" TEXT,
    "orgNumber" TEXT,
    "vatNumber" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "showAddress" BOOLEAN NOT NULL DEFAULT true,
    "showOrgNumber" BOOLEAN NOT NULL DEFAULT true,
    "showVatNumber" BOOLEAN NOT NULL DEFAULT true,
    "showPhone" BOOLEAN NOT NULL DEFAULT false,
    "showEmail" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id")
);
