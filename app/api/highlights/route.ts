import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateHighlights } from "@/lib/ai/highlights/generateHighlights";

export async function POST(req: Request) {
    
    const { videoId } = await req.json();

    if (!videoId) {
        return NextResponse.json({ error: "videoId required" }, { status: 400 });
    }
    

    const transcript = await prisma.transcript.findFirst({
        where: { videoId },
        orderBy: { createdAt: "desc" }
    });

    if (!transcript) {
        return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
    }

    type TranscriptSegment = {
    start: number;
    end: number;
    text: string;
        };

    const rawSegments = transcript.segments;

    if (!Array.isArray(rawSegments)) {
    throw new Error("Transcript segments missing or invalid");
    }

    const segments = rawSegments as TranscriptSegment[];

    const highlights = await generateHighlights({segments});

    const saved = await prisma.highlight.create({
        data: {
        videoId,
        transcriptId: transcript.id,
        highlights
    }
  });

    return NextResponse.json(
    {
        videoId,
        highlights
    },
    { status: 201 }
    );

}
