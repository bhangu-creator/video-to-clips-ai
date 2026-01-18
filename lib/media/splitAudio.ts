import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";

export async function splitAudio(
  audioPath: string,
  chunkDuration = 120 // seconds (2 minutes)
): Promise<string[]> {
  const outputDir = audioPath.replace(/\.mp3$/, "_chunks");
  await fs.mkdir(outputDir, { recursive: true });

  const outputPattern = path.join(outputDir, "chunk_%03d.mp3");

  // Fixed: Use the actual audioPath and chunkDuration parameters
  const command = `ffmpeg -y -i "${audioPath}" -f segment -segment_time ${chunkDuration} -reset_timestamps 1 -ac 1 -ar 16000 -c:a libmp3lame "${outputPattern}"`;

  await new Promise<void>((resolve, reject) => {
    exec(command, (err) => (err ? reject(err) : resolve()));
  });

  const files = await fs.readdir(outputDir);
  return files
    .filter((f) => f.endsWith(".mp3"))
    .map((f) => path.join(outputDir, f))
    .sort();
}