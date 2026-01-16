import { prisma } from "@/lib/prisma";

export async function createChunkRecords(chunks:string[],jobId:string,videoId:string) : Promise<void>
{
// create chunk rows if not exists
for (let i = 0; i < chunks.length; i++) {

    try{

  await prisma.transcriptChunk.upsert({
    where: {
      jobId_chunkIndex: {
        jobId,
        chunkIndex: i,
      },
    },
    update: {
        filePath:chunks[i]
    },
    create: {
      jobId,
      videoId,
      chunkIndex: i,
      filePath: chunks[i],
      status: "PENDING",
    },
  });
    }catch(error)
    {
        console.error(`Failed to create chunks records (jobId=${jobId}), chunksIndex=${i}`);
        throw error;
    }
    
}
}

