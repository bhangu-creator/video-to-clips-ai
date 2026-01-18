import { prisma } from "@/lib/prisma";

// Create or update transcript chunk records in database
export async function createChunkRecords(
  chunks: string[],
  jobId: string,
  videoId: string
): Promise<void> {

  // Loop through all chunk file paths
  for (let i = 0; i < chunks.length; i++) {
    try {
      // Create chunk record if not exists, otherwise update it
      await prisma.transcriptChunk.upsert({
        where: {
          jobId_chunkIndex: {
            jobId,
            chunkIndex: i,
          },
        },
        update: {
          filePath: chunks[i],
        },
        create: {
          jobId,
          videoId,
          chunkIndex: i,
          filePath: chunks[i],
          status: "PENDING",
        },
      });
    } catch (error) {
      // Log error if chunk record creation fails
      console.error(
        `Failed to create chunks records (jobId=${jobId}), chunksIndex=${i}`
      );
      throw error;
    }
  }
}
