import { Queue } from "bullmq";
import { redisConnection } from "@/lib/queue/redis";

async function clearQueues() {
  const transcriptQueue = new Queue("transcript-queue", {
    connection: redisConnection,
  });

  const clipsQueue = new Queue("clips-queue", {
    connection: redisConnection,
  });

  // Clear all jobs
  await transcriptQueue.obliterate({ force: true });
  await clipsQueue.obliterate({ force: true });

  console.log("All queues cleared");

  await transcriptQueue.close();
  await clipsQueue.close();
  process.exit(0);
}

clearQueues();