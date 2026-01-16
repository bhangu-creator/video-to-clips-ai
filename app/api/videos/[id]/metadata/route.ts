import { prisma } from "@/lib/prisma";
import { exec } from "child_process";
import path from "path";

export async function POST(req: Request) {
  try {
    // Extract ID manually from URL
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    const videoId = segments[segments.length - 2]; 
    // /api/videos/{id}/metadata

    if (!videoId) {
      return Response.json({ error: "Video ID missing" }, { status: 400 });
    }

    const video = await prisma.video.findUnique({
      where: { id: videoId },
    });

    if (!video) {
      return Response.json({ error: "Video not found" }, { status: 404 });
    }

    const absolutePath = path.join(process.cwd(), video.filePath);

    const duration = await new Promise<number>((resolve, reject) => {
      const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${absolutePath}"`;

      exec(cmd, (err, stdout) => {
        if (err) return reject(err);
        resolve(Math.floor(Number(stdout.trim())));
      });
    });

    await prisma.video.update({
      where: { id: videoId },
      data: {
        duration,
        status: "processing",
      },
    });

    return Response.json({ duration });
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: "Metadata extraction failed" },
      { status: 500 }
    );
  }
}
