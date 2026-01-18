import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateHighlights } from "@/lib/ai/highlights/generateHighlights";

// API route to generate and save highlights for a video
export async function POST(req: Request) {

    // Read videoId from request body
    const { videoId } = await req.json();

    // Return error if videoId is missing
    if (!videoId) {
        return NextResponse.json({ error: "videoId required" }, { status: 400 });
    }

    // Fetch the latest transcript for the given video
    const transcript = await prisma.transcript.findFirst({
        where: { videoId },
        orderBy: { createdAt: "desc" }
    });

    // Return error if transcript is not found
    if (!transcript) {
        return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
    }

    // Type definition for transcript segments
    type TranscriptSegment = {
        start: number;
        end: number;
        text: string;
    };

    // Get raw segments from transcript
    const rawSegments = transcript.segments;

    // Ensure segments exist and are in correct format
    if (!Array.isArray(rawSegments)) {
        throw new Error("Transcript segments missing or invalid");
    }

    // Cast raw segments to expected type
    const segments = rawSegments as TranscriptSegment[];

    // Generate highlight timestamps using AI
    const highlights = await generateHighlights({ segments });

    // Save generated highlights to database
    const saved = await prisma.highlight.create({
        data: {
            videoId,
            transcriptId: transcript.id,
            highlights
        }
    });

    // Return highlights in response
    return NextResponse.json(
        {
            videoId,
            highlights
        },
        { status: 201 }
    );
}
