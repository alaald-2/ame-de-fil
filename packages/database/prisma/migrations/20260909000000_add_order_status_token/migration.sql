-- CreateTable
CREATE TABLE "OrderStatusToken" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderStatusToken_orderId_key" ON "OrderStatusToken"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderStatusToken_tokenHash_key" ON "OrderStatusToken"("tokenHash");

-- CreateIndex
CREATE INDEX "OrderStatusToken_expiresAt_idx" ON "OrderStatusToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "OrderStatusToken" ADD CONSTRAINT "OrderStatusToken_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
