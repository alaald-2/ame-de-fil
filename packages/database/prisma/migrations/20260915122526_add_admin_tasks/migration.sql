-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('START_PRODUCTION', 'FINISH_PRODUCTION', 'QUALITY_CHECK', 'PACK_ORDER', 'SHIP_ORDER', 'FOLLOW_UP_DELAYED_ORDER', 'RESTOCK', 'CUSTOMER_FOLLOW_UP', 'FOLLOW_UP_PENDING_REFUND', 'FOLLOW_UP_FAILED_REFUND', 'REVIEW_DISPUTE', 'INSPECT_RETURN', 'GENERAL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "TaskSource" AS ENUM ('MANUAL', 'AUTOMATED');

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,
    "source" "TaskSource" NOT NULL DEFAULT 'MANUAL',
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "assignedToUserId" TEXT,
    "createdByUserId" TEXT,
    "orderId" TEXT,
    "orderItemId" TEXT,
    "productVariantId" TEXT,
    "customerUserId" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Task_dedupeKey_key" ON "Task"("dedupeKey");

-- CreateIndex
CREATE INDEX "Task_status_dueAt_idx" ON "Task"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_assignedToUserId_idx" ON "Task"("assignedToUserId");

-- CreateIndex
CREATE INDEX "Task_orderId_idx" ON "Task"("orderId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
