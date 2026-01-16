import { TranscriptChunk } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {sendChunkToWhisper} from "@/lib/transcript/sendChunkToWhisper";

export async function processChunks(chunks:TranscriptChunk[]) : Promise<boolean>
{
    let allSuccess = true;
    const delayBetweenChunks = 2500;

    for (const chunk of chunks) {
    if (chunk.status === "COMPLETED") {
        console.log(`Skipping chunk ${chunk.chunkIndex}`);
        continue;
    }

    try {
        await prisma.transcriptChunk.update({
        where: { id: chunk.id },
        data: { status: "PROCESSING" },
        });

        //adding wait before sending
        console.log(`Waiting ${delayBetweenChunks}ms before next chunk...`);
        await new Promise(res => setTimeout(res, delayBetweenChunks));

        const text = await sendChunkToWhisper(chunk.filePath);

        await prisma.transcriptChunk.update({
        where: { id: chunk.id },
        data: {
            status: "COMPLETED",
            text,
        },
        });

    } catch (err: any) {
        allSuccess = false;

        await prisma.transcriptChunk.update({
        where: { id: chunk.id },
        data: {
            status: "FAILED",
            error: err.message ?? "Unknown error",
        },
        });

        console.error(
        `Chunk ${chunk.chunkIndex} failed`,
        err.message
        );
    }
    }

return allSuccess;


}