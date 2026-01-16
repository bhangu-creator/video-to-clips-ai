import { prisma } from "@/lib/prisma";

const CHUNK_DURATION = 120; // seconds

export async function assembleTranscript(jobId: string) {
  const job = await prisma.transcriptJob.findUnique({
    where: { id: jobId }
  });

  if (!job) {
    throw new Error("Job not found");
  }

  // Idempotency guard
  const existing = await prisma.transcript.findFirst({
    where: { jobId }
  });

  if (existing) {
    return;
  }

  if (job.status !== "PROCESSING") {
    throw new Error("Invalid job state");
  }

  const incompleteCount = await prisma.transcriptChunk.count({
    where: {
      jobId,
      status: { not: "COMPLETED" }
    }
  });

  if (incompleteCount > 0) {
    throw new Error("Not all chunks completed");
  }

   const video = await prisma.video.findUnique({
    where: { id: job.videoId },
    select: { duration: true }
  });

  if (!video?.duration) {
    throw new Error("Video duration missing");
  }

  const chunks = await prisma.transcriptChunk.findMany({
    where: { jobId },
    orderBy: { chunkIndex: "asc" }
  });

  const segments = chunks.map(chunk => ({
    index: chunk.chunkIndex,
    start : chunk.chunkIndex * CHUNK_DURATION,
    end : Math.min((chunk.chunkIndex+1)*CHUNK_DURATION,video.duration),
    text: chunk.text
  }));

  await prisma.$transaction([
    prisma.transcript.create({
      data: {
        videoId: job.videoId,
        jobId,
        segments
      }
    }),
    prisma.transcriptJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        finishedAt: new Date()
      }
    })
  ]);
}
