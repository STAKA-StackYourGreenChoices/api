-- Phase 1 + 2: catalog fields, GTIN normalisation, one card per user per product.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "description" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "SustainabilityInfo" ADD COLUMN     "certifierName" TEXT;

-- Data: GTINs are now always stored as 14 digits (GTIN-14). Scanners read
-- 8/12/13-digit codes; the API left-pads them with zeros before lookup, so
-- existing shorter values must be padded the same way to stay findable.
UPDATE "Product" SET "gtin" = lpad("gtin", 14, '0') WHERE length("gtin") < 14;

-- Data: before brand names become unique, suffix any duplicates so the index
-- can be created. The earliest-created brand keeps the plain name.
UPDATE "Brand" b
SET "name" = b."name" || ' (' || dup.rn || ')'
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "name" ORDER BY "createdAt", "id") - 1 AS rn
  FROM "Brand"
) dup
WHERE b."id" = dup."id" AND dup.rn > 0;

-- Data: before cards become unique per (user, product), keep only the
-- earliest card of any duplicate set.
DELETE FROM "DigitalCard" d
USING (
  SELECT "id", row_number() OVER (PARTITION BY "userId", "productId" ORDER BY "createdAt", "id") AS rn
  FROM "DigitalCard"
) dup
WHERE d."id" = dup."id" AND dup.rn > 1;

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalCard_userId_productId_key" ON "DigitalCard"("userId", "productId");
