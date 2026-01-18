import fs from "fs";
import Groq from "groq-sdk";

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

// Send an audio chunk to Whisper for transcription
export async function sendChunkToWhisper(
  filePath: string,
  retries = 3
): Promise<string> {

  // Retry transcription on failure
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Send audio file to Groq Whisper API
      const response = await groq.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "whisper-large-v3-turbo",
        language: "en",
        response_format: "json",
      });

      // Ensure transcription text exists
      if (!response.text) {
        throw new Error("Empty transcription returned");
      }

      // Return transcribed text
      return response.text;

    } catch (err: any) {
      // Handle rate limit errors with retry
      const isRateLimit =
        err.status === 429 || err.message?.includes("rate limit");
      const isLastAttempt = attempt === retries;

      if (isRateLimit && !isLastAttempt) {
        const waitTime = 5000 * attempt;
        console.log(
          `Rate limited, waiting ${waitTime}ms before retry ${attempt}/${retries}...`
        );
        await new Promise(res => setTimeout(res, waitTime));
        continue;
      }

      console.error(
        `Groq transcription failed (attempt ${attempt}/${retries}):`,
        err.message
      );
      throw err;
    }
  }

  throw new Error("Max retries exceeded");
}
