import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: Request,
  { params }: { params: { videoId: string } }
) {

  // Extract ID manually from URL
  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const videoId = segments[segments.length - 2]; 

  if (!videoId) {
    return NextResponse.json(
      { highlights: [] },
      { status: 200 }
    );
  }

  const record = await prisma.highlight.findFirst({
    where: { videoId },
    orderBy: { createdAt: "desc" },
  });

  // empty array return for UI
  const highlights = Array.isArray(record?.highlights)
    ? record.highlights
    : [];

  return NextResponse.json(
    {
      videoId,
      highlights,
    },
    { status: 200 }
  );
}
