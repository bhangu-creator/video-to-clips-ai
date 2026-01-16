//queuing the transcript jobs
import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export const transcriptQueue = new Queue("transcript-queue", {
  connection: redisConnection,
});
