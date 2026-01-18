import { prisma } from "@/lib/prisma";
import { exec } from "child_process";
import path from "path";

// POST API to extract and save video metadata
export async function POST(req: Request) {
  try {
    // Extract videoId from request URL
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    const videoId = segments[segments.length - 2]; 
    // Expected route: /api/videos/{id}/metadata

    // Return error if videoId is missing
    if (!videoId) {
      return Response.json({ error: "Video ID missing" }, { status: 400 });
    }

    // Fetch video record from database
    const video = await prisma.video.findUnique({
      where: { id: videoId },
    });

    // Return error if video not found
    if (!video) {
      return Response.json({ error: "Video not found" }, { status: 404 });
    }

    // Build absolute path to video file
    const absolutePath = path.join(process.cwd(), video.filePath);

    // Extract video duration using ffprobe
    const duration = await new Promise<number>((resolve, reject) => {
      const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${absolutePath}"`;

      exec(cmd, (err, stdout) => {
        if (err) return reject(err);
        resolve(Math.floor(Number(stdout.trim())));
      });
    });

    // Update video metadata in database
    await prisma.video.update({
      where: { id: videoId },
      data: {
        duration,
        status: "processing",
      },
    });

    // Return extracted duration
    return Response.json({ duration });
  } catch (err) {
    // Handle unexpected errors
    console.error(err);
    return Response.json(
      { error: "Metadata extraction failed" },
      { status: 500 }
    );
  }
}
