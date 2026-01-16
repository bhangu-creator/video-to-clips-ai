import { Worker } from "bullmq";
import { redisConnection } from "@/lib/queue/redis";
import { prisma } from "@/lib/prisma";
import { extractAudio } from "../media/extractAudio";
import {splitAudio} from "../media/splitAudio";
import {createChunkRecords} from "@/lib/chunks/createRecords";
import {processChunks} from "@/lib/chunks/processChunks";
import {assembleTranscript} from "@/lib/transcript/assembleTranscript";
import "dotenv/config";

console.log("Transcript worker starting...");

const worker = new Worker(
    "transcript-queue",
    async (job) => {
    const { videoId, jobId } = job.data;

    console.log(`Received job ${jobId} for video ${videoId}`);

    try {
            //Mark job as PROCESSING
            await prisma.transcriptJob.update({
            where: { id: jobId },
            data: {
                status: "PROCESSING",
                startedAt: new Date(),
            },
            });

            //fetch video record 
            const video = await prisma.video.findUnique({
            where : {id:videoId},
            });

            if(!video)
            {
            throw new Error("Video not found");
            }

            //extracting audio
            console.log("extracting audio....")
            const audioPath= await extractAudio(video.filePath);
            console.log("Audio extracted at :",audioPath);

            //making video into chunks of 120 secs
            const chunks_array= await splitAudio(audioPath,120)

            //creating the chunks records
            await createChunkRecords(chunks_array,jobId,videoId);

            //get the created chunks from db
            const chunks = await prisma.transcriptChunk.findMany({
            where: { jobId },
            orderBy: { chunkIndex: "asc" },
            });

            //before processing chunk
            await new Promise(res => setTimeout(res, 2000));

            //processing each created chunks
            const noFailures= await processChunks(chunks);

            //merge all the transcripts if job has no failures
            if (noFailures) {await assembleTranscript(jobId);}
            console.log(`Job ${jobId} completed`);
            
    //handle error
    } catch (error: any) {
        console.error(`Job ${jobId} failed`, error);

        //Mark job as FAILED
        await prisma.transcriptJob.update({
        where: { id: jobId },
        data: {
            status: "FAILED",
            error: error.message ?? "Unknown error",
            finishedAt: new Date(),
        },
        });

        throw error; 
    }
  },
  {
    connection: redisConnection,
    concurrency: 1,
  }
);

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} permanently failed`, err);
});
