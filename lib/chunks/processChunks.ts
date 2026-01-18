import { TranscriptChunk } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendChunkToWhisper } from "@/lib/transcript/sendChunkToGrok";

// Process transcript chunks one by one
export async function processChunks(
  chunks: TranscriptChunk[]
): Promise<boolean> {

  let allSuccess = true;
  const delayBetweenChunks = 2500;

  // Loop through each transcript chunk
  for (const chunk of chunks) {

    // Skip already completed chunks
    if (chunk.status === "COMPLETED") {
      console.log(`Skipping chunk ${chunk.chunkIndex}`);
      continue;
    }

    try {
      // Mark chunk as processing
      await prisma.transcriptChunk.update({
        where: { id: chunk.id },
        data: { status: "PROCESSING" },
      });

      // Wait before sending next chunk
      console.log(`Waiting ${delayBetweenChunks}ms before next chunk...`);
      await new Promise(res => setTimeout(res, delayBetweenChunks));

      // Send chunk audio to Whisper and get text
      const text = await sendChunkToWhisper(chunk.filePath);

      // Save transcription result
      await prisma.transcriptChunk.update({
        where: { id: chunk.id },
        data: {
          status: "COMPLETED",
          text,
        },
      });

    } catch (err: any) {
      // Mark chunk as failed if error occurs
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

  // Return overall success status
  return allSuccess;
}
