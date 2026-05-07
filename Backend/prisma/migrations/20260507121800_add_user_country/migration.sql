-- AlterTable
ALTER TABLE "User" ADD COLUMN "country" TEXT;

-- CreateIndex
CREATE INDEX "User_country_idx" ON "User"("country");
