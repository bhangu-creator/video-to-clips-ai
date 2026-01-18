import { Worker } from "bullmq";
import { redisConnection } from "@/lib/queue/redis";
import { prisma } from "@/lib/prisma";
import { handleClipJob } from "@/lib/clips/handleClipGeneration";
import "dotenv/config";

console.log("Clips worker starting...");

const worker = new Worker(
  "clips-queue",
  async (job) => {
    const { videoId } = job.data;

    console.log(`Processing clips for video ${videoId}`);

    try {
      
      // verifying job in db and Mark job as processing
      const res = await prisma.job.updateMany({
        where: {
          videoId,
          type: "CLIPS",
          status: "pending",
        },
        data: {
          status: "processing",
        },
      });

      if (res.count === 0) {
        console.log("No pending DB job found. Skipping.");
        return;
      }

      // Generate all clips
      await handleClipJob(videoId);

      // Mark job as done
      await prisma.job.updateMany({
        where: {
          videoId,
          type: "CLIPS",
          status: "processing",
        },
        data: {
          status: "done",
        },
      });

      // Update video status to ready
      await prisma.video.update({
        where: { id: videoId },
        data: { status: "ready" },
      });

      console.log(`Clips generated successfully for video ${videoId}`);

    } catch (error: any) {
      console.error(`Clips generation failed for video ${videoId}:`, error);

      // Mark job as failed
      await prisma.job.updateMany({
        where: {
          videoId,
          type: "CLIPS",
          status: "processing",
        },
        data: {
          status: "failed",
          error: error.message ?? "Unknown error",
        },
      });

      // Update video status to failed
      await prisma.video.update({
        where: { id: videoId },
        data: { status: "failed" },
      });

      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1, // Process one video at a time
  }
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} permanently failed:`, err);
});

worker.on("error", (err) => {
  console.error("Worker error:", err);
});

console.log("Clips worker ready and listening...");