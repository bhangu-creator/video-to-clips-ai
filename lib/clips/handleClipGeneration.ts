import { prisma } from "@/lib/prisma";
import { generateClip } from "./generateClip";
import { saveClipRow } from "./saveClipsRows";

type Highlight = {
  index?: number;
  startTime: number;
  endTime: number;
  title: string;
  reason: string;
};

export async function handleClipJob(videoId: string): Promise<void> {
  // Fetch video
  const video = await prisma.video.findUnique({
    where: { id: videoId },
  });

  if (!video || !video.filePath) {
    throw new Error(`Video or video filePath missing for ${videoId}`);
  }

  console.log(`Video path: ${video.filePath}`);

  // Fetch latest highlights
  const highlightsRecord = await prisma.highlight.findFirst({
    where: { videoId },
    orderBy: { createdAt: "desc" },
  });

  if (!highlightsRecord) {
    throw new Error(`No highlight record found for video ${videoId}`);
  }

  const highlights = highlightsRecord.highlights as unknown as Highlight[];

  if (!Array.isArray(highlights)) {
    throw new Error("Invalid highlights format");
  }

  if (highlights.length === 0) {
    throw new Error(`Highlights empty for video ${videoId}`);
  }

  console.log(`Processing ${highlights.length} highlights...`);

  const failedClips: string[] = [];
  let successCount = 0;

  // Process highlights sequentially
  for (let i = 0; i < highlights.length; i++) {
    const highlight = highlights[i];
    const label = `Highlight ${i + 1}/${highlights.length} (${highlight.title})`;

    try {
      if (
        typeof highlight.startTime !== "number" ||
        typeof highlight.endTime !== "number"
      ) {
        throw new Error("Invalid highlight time range");
      }

      console.log(`${label}: Generating clips...`);

      // Generate horizontal clip
      const horizontalPath = await generateClip({
        videoPath: video.filePath,
        videoId,
        highlight,
        format: "horizontal_16_9",
      });

      console.log(`Horizontal: ${horizontalPath}`);

      await saveClipRow({
        videoId,
        highlight,
        format: "horizontal_16_9",
      });

      // Generate vertical clip
      const verticalPath = await generateClip({
        videoPath: video.filePath,
        videoId,
        highlight,
        format: "vertical_9_16",
      });

      console.log(`Vertical: ${verticalPath}`);

      await saveClipRow({
        videoId,
        highlight,
        format: "vertical_9_16",
      });

      successCount++;

    } catch (err: any) {
      const errorLabel =
        typeof highlight.index === "number"
          ? `index ${highlight.index}`
          : `time ${highlight.startTime}-${highlight.endTime}`;

      console.error(`Failed: ${errorLabel}`, err.message);
      
      failedClips.push(errorLabel);
      
      // Continue processing other clips
      continue;
    }
  }

  console.log(`Clip generation complete: ${successCount}/${highlights.length} successful`);

  if (failedClips.length > 0) {
    throw new Error(
      `${failedClips.length} clip(s) failed: ${failedClips.join(", ")}`
    );
  }
}