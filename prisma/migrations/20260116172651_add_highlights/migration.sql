-- CreateTable
CREATE TABLE "Highlight" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "highlights" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Highlight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Highlight_videoId_idx" ON "Highlight"("videoId");

-- CreateIndex
CREATE INDEX "Highlight_transcriptId_idx" ON "Highlight"("transcriptId");

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
