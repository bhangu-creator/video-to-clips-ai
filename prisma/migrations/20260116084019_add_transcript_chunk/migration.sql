-- CreateTable
CREATE TABLE "TranscriptChunk" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "text" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranscriptChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TranscriptChunk_jobId_idx" ON "TranscriptChunk"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptChunk_jobId_chunkIndex_key" ON "TranscriptChunk"("jobId", "chunkIndex");
