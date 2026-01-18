import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export const clipsQueue = new Queue("clips-queue", {
  connection: redisConnection,
});
