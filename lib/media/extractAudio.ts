import { exec } from "child_process";
import path from "path";
import fs from "fs/promises";

export async function extractAudio(videoPath: string): Promise<string> {
  // Ensure video exists
  await fs.access(videoPath);

  const audioPath = videoPath.replace(/\.[^/.]+$/, ".mp3");

  const command = `ffmpeg -y -i "${videoPath}" -vn -acodec mp3 "${audioPath}"`;

  await new Promise<void>((resolve, reject) => {
    exec(command, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  // Verify audio was created
  await fs.access(audioPath);

  return audioPath;
}
