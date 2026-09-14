-- CreateEnum
CREATE TYPE "AccountActionTokenPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- Note: `prisma migrate dev`'s diff engine spuriously proposed dropping
-- ProductVariant.articleNumber's dbgenerated() sequence default here (a
-- known Prisma limitation diffing raw-SQL `dbgenerated()` defaults against
-- shadow-db introspection — unrelated to this migration's actual change,
-- and would have broken a live, populated NOT NULL column). Removed by
-- hand; this migration is otherwise exactly what `migrate dev` generated.

-- CreateTable
CREATE TABLE "AccountActionToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "AccountActionTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountActionToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountActionToken_tokenHash_key" ON "AccountActionToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountActionToken_userId_purpose_idx" ON "AccountActionToken"("userId", "purpose");

-- CreateIndex
CREATE INDEX "AccountActionToken_expiresAt_idx" ON "AccountActionToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "AccountActionToken" ADD CONSTRAINT "AccountActionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
