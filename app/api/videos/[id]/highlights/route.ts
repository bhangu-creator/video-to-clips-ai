import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET API to fetch highlights for a video
export async function GET(
  req: Request,
  { params }: { params: { videoId: string } }
) {

  // Extract videoId from request URL
  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const videoId = segments[segments.length - 2]; 

  // Return empty highlights if videoId is missing
  if (!videoId) {
    return NextResponse.json(
      { highlights: [] },
      { status: 200 }
    );
  }

  // Fetch latest highlights record for the video
  const record = await prisma.highlight.findFirst({
    where: { videoId },
    orderBy: { createdAt: "desc" },
  });

  // Ensure highlights is always an array for UI
  const highlights = Array.isArray(record?.highlights)
    ? record.highlights
    : [];

  // Return videoId and highlights
  return NextResponse.json(
    {
      videoId,
      highlights,
    },
    { status: 200 }
  );
}
