import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { transcriptQueue } from "@/lib/queue/transcript.queue";

/**
 * POST /api/videos/:id/transcript
 * Generate the transcript of the uploaded video
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {

  // Extract ID manually from URL
  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const videoId = segments[segments.length - 2]; 

  //Validate video exists
  const video = await prisma.video.findUnique({
    where: { id: videoId },
  });

  if (!video) {
    return NextResponse.json(
      { error: "Video not found" },
      { status: 404 }
    );
  }

  //Create transcript job
  const job = await prisma.transcriptJob.create({
    data: {
      videoId,
      status: "PENDING",
    },
  });

  //Enqueue job
  await transcriptQueue.add(
    "transcribe-video",
    {
      videoId,
      jobId: job.id,
    },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: true,
    }
  );

  // Return immediately
  return NextResponse.json(
    {
      message: "Transcription started",
      jobId: job.id,
    },
    { status: 202 }
  );
}

/**
 * GET /api/videos/:id/transcript
 * View final assembled transcript
 */

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {

    // Extract ID manually from URL
    const url = new URL(req.url);
    const tempSegments = url.pathname.split("/");
    const videoId = tempSegments[tempSegments.length - 2]; 


    //Validate video
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true }
    });

    if (!video) {
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
    }

    //Fetch transcript
    const transcript = await prisma.transcript.findFirst({
      where: { videoId },
      select: {
        segments: true,
        language: true
      }
    });

    if (transcript) {
      return NextResponse.json({
        status: "COMPLETED",
        segments: transcript.segments,
        language: transcript.language
      });
    }

    //Job status fallback
    const job = await prisma.transcriptJob.findFirst({
      where: { videoId },
      orderBy: { createdAt: "desc" },
      select: {
        status: true,
        error: true
      }
    });

    if (!job) {
      return NextResponse.json({
        status: "NOT_STARTED"
      });
    }

    return NextResponse.json({
      status: job.status,
      error: job.error ?? null
    });

  } catch (error) {
    console.error("GET /transcript failed", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



