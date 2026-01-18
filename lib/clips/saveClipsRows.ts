import { prisma } from "@/lib/prisma";
import path from "path";

type ClipFormat = "horizontal_16_9" | "vertical_9_16";

type Highlight = {
  title: string;
  startTime: number;
  endTime: number;
};

type SaveClipInput = {
  videoId: string;
  highlight: Highlight;
  format: ClipFormat;
};

export async function saveClipRow({
  videoId,
  highlight,
  format,
}: SaveClipInput) {
  // Sanitize title for filename
  const safeTitle = highlight.title
    .replace(/[^a-zA-Z0-9]/g, "_")
    .substring(0, 50);

  const timestamp = `${Math.floor(highlight.startTime)}_${Math.floor(highlight.endTime)}`;
  const filename = `${format}_${timestamp}_${safeTitle}.mp4`;
  const filePath = path.join("clips", videoId, filename);

  // Check if clip already exists
  const existing = await prisma.clip.findFirst({
    where: {
      videoId,
      startTime: highlight.startTime,
      endTime: highlight.endTime,
      format,
    },
  });

  if (existing) {
    console.log(`Clip already exists in DB: ${existing.id}`);
    return existing;
  }

  // Create new clip record
  return prisma.clip.create({
    data: {
      videoId,
      title: highlight.title,
      startTime: highlight.startTime,
      endTime: highlight.endTime,
      format,
      filePath,
    },
  });
}