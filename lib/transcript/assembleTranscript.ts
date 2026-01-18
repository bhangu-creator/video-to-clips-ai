import { prisma } from "@/lib/prisma";

const CHUNK_DURATION = 120; // seconds per transcript chunk

// Assemble final transcript from processed chunks
export async function assembleTranscript(jobId: string) {

  // Fetch transcript job
  const job = await prisma.transcriptJob.findUnique({
    where: { id: jobId }
  });

  // Ensure job exists
  if (!job) {
    throw new Error("Job not found");
  }

  // Prevent duplicate transcript creation
  const existing = await prisma.transcript.findFirst({
    where: { jobId }
  });

  if (existing) {
    return;
  }

  // Ensure job is in correct state
  if (job.status !== "PROCESSING") {
    throw new Error("Invalid job state");
  }

  // Check if all chunks are completed
  const incompleteCount = await prisma.transcriptChunk.count({
    where: {
      jobId,
      status: { not: "COMPLETED" }
    }
  });

  if (incompleteCount > 0) {
    throw new Error("Not all chunks completed");
  }

  // Fetch video duration
  const video = await prisma.video.findUnique({
    where: { id: job.videoId },
    select: { duration: true }
  });

  if (!video?.duration) {
    throw new Error("Video duration missing");
  }

  // Fetch all transcript chunks in order
  const chunks = await prisma.transcriptChunk.findMany({
    where: { jobId },
    orderBy: { chunkIndex: "asc" }
  });

  // Build transcript segments from chunks
  const segments = chunks.map(chunk => ({
    index: chunk.chunkIndex,
    start: chunk.chunkIndex * CHUNK_DURATION,
    end: Math.min(
      (chunk.chunkIndex + 1) * CHUNK_DURATION,
      video.duration
    ),
    text: chunk.text
  }));

  // Save transcript and update job status
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
