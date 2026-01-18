/*
  Warnings:

  - You are about to drop the column `orientation` on the `Clip` table. All the data in the column will be lost.
  - Added the required column `format` to the `Clip` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Clip" DROP COLUMN "orientation",
ADD COLUMN     "format" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Clip_videoId_idx" ON "Clip"("videoId");
