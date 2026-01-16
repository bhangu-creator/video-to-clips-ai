import fs from "fs";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

export async function sendChunkToWhisper(
  filePath: string,
  retries = 3
): Promise<string> {

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await groq.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "whisper-large-v3-turbo", 
        language: "en",
        response_format: "json",
      });

      if (!response.text) {
        throw new Error("Empty transcription returned");
      }

      return response.text;

    } catch (err: any) {
      const isRateLimit = err.status === 429 || err.message?.includes("rate limit");
      const isLastAttempt = attempt === retries;

      if (isRateLimit && !isLastAttempt) {
        const waitTime = 5000 * attempt; // 5s, 10s, 15s
        console.log(`Rate limited, waiting ${waitTime}ms before retry ${attempt}/${retries}...`);
        await new Promise(res => setTimeout(res, waitTime));
        continue;
      }

      console.error(`Groq transcription failed (attempt ${attempt}/${retries}):`, err.message);
      throw err;
    }
  }

  throw new Error("Max retries exceeded");
}