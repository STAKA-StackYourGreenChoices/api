-- Phase 4: proof of ownership (order match or receipt reviewed by an admin).

-- CreateEnum
CREATE TYPE "ClaimMethod" AS ENUM ('ORDER_MATCH', 'RECEIPT');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "DigitalCard" ADD COLUMN     "ownershipVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OwnershipClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "method" "ClaimMethod" NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "orderId" TEXT,
    "receiptPath" TEXT,
    "receiptMimeType" TEXT,
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnershipClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OwnershipClaim_userId_productId_idx" ON "OwnershipClaim"("userId", "productId");

-- CreateIndex
CREATE INDEX "OwnershipClaim_status_createdAt_idx" ON "OwnershipClaim"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "OwnershipClaim" ADD CONSTRAINT "OwnershipClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipClaim" ADD CONSTRAINT "OwnershipClaim_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipClaim" ADD CONSTRAINT "OwnershipClaim_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipClaim" ADD CONSTRAINT "OwnershipClaim_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

