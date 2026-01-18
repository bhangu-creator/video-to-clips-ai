import { exec } from "child_process";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

type ClipFormat = "horizontal_16_9" | "vertical_9_16";

type Highlight = {
  startTime: number;
  endTime: number;
  title: string;
};

type GenerateClipInput = {
  videoPath: string;
  videoId: string;
  highlight: Highlight;
  format: ClipFormat;
};

/**
 * ============================
 * Simple file logger
 * ============================
 */

const logDir = path.join(process.cwd(), "logs");
if (!fsSync.existsSync(logDir)) {
  fsSync.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(
  logDir,
  `ffmpeg-${new Date().toISOString().split("T")[0]}.log`
);

function log(message: string) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fsSync.appendFileSync(logFile, line);
  console.log(message);
}

export async function generateClip({
  videoPath,
  videoId,
  highlight,
  format,
}: GenerateClipInput): Promise<string> {
  if (!videoPath) {
    throw new Error("Video path missing");
  }

  try {
    await fs.access(videoPath);
  } catch {
    throw new Error(`Input video not found: ${videoPath}`);
  }

  const outputDir = path.join("clips", videoId);
  await fs.mkdir(outputDir, { recursive: true });

  const duration = highlight.endTime - highlight.startTime;
  if (duration <= 0) {
    throw new Error(
      `Invalid clip duration: ${duration}s (${highlight.startTime} to ${highlight.endTime})`
    );
  }

  const safeTitle = highlight.title
    .replace(/[^a-zA-Z0-9]/g, "_")
    .substring(0, 50);

  const timestamp = `${Math.floor(highlight.startTime)}_${Math.floor(
    highlight.endTime
  )}`;
  const filename = `${format}_${timestamp}_${safeTitle}.mp4`;
  const outputPath = path.join(outputDir, filename);

  let videoFilter: string;

  if (format === "vertical_9_16") {
    videoFilter =
      "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920";
  } else {
    videoFilter =
      "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2";
  }

  //IMPORTANT: limit ffmpeg log spam
  const command = `ffmpeg -y -loglevel error -stats -ss ${highlight.startTime} -i "${videoPath}" -t ${duration} -vf "${videoFilter}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${outputPath}"`;

  log(`START clip | video=${videoId} | format=${format} | ${highlight.startTime}s → ${highlight.endTime}s`);
  log(`CMD: ${command}`);

  return new Promise((resolve, reject) => {
    exec(command, { maxBuffer: 5 * 1024 * 1024 }, async (error, stdout, stderr) => {
      if (stderr) {
        log(`FFMPEG STDERR: ${stderr}`);
      }

      if (error) {
        log(`FFMPEG ERROR: ${error.message}`);
        reject(new Error(`FFmpeg failed: ${error.message}`));
        return;
      }

      try {
        await fs.access(outputPath);
        const stats = await fs.stat(outputPath);

        if (stats.size === 0) {
          log(`ERROR: Empty output file ${outputPath}`);
          reject(new Error(`FFmpeg created empty file: ${outputPath}`));
          return;
        }

        log(
          `SUCCESS clip | ${outputPath} | ${(stats.size / 1024 / 1024).toFixed(
            2
          )} MB`
        );

        resolve(outputPath);
      } catch {
        log(`ERROR: Output file not created ${outputPath}`);
        reject(new Error(`Output file not created: ${outputPath}`));
      }
    });
  });
}
