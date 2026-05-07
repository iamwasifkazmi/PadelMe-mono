-- CreateEnum
CREATE TYPE "CommunityPostKind" AS ENUM ('feedback', 'idea', 'general');

-- CreateTable
CREATE TABLE "CommunityPost" (
    "id" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "kind" "CommunityPostKind" NOT NULL DEFAULT 'general',
    "title" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityPost_createdAt_idx" ON "CommunityPost"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "CommunityPost_authorEmail_idx" ON "CommunityPost"("authorEmail");

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_authorEmail_fkey" FOREIGN KEY ("authorEmail") REFERENCES "User"("email") ON DELETE CASCADE ON UPDATE CASCADE;
