import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clipsQueue } from "@/lib/queue/clips.queue";

export async function POST(
  req: Request,
  { params }: { params: { videoId: string } }
) {
  try {

    // Extract ID manually from URL
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    const videoId = segments[segments.length - 2]; 

    if (!videoId) {
      return NextResponse.json(
        { error: "videoId required" },
        { status: 400 }
      );
    }

    // Ensure video exists
    const video = await prisma.video.findUnique({
      where: { id: videoId },
    });

    if (!video) {
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
    }

    // Check if highlights exist
    const highlightsRecord = await prisma.highlight.findFirst({
      where: { videoId },
      orderBy: { createdAt: "desc" },
    });

    if (!highlightsRecord) {
      return NextResponse.json(
        { error: "No highlights found for this video. Generate highlights first." },
        { status: 400 }
      );
    }

    // Prevent duplicate jobs
    const existingJob = await prisma.job.findFirst({
      where: {
        videoId,
        type: "CLIPS",
        status: { in: ["pending", "processing"] },
      },
    });

    if (existingJob) {
      return NextResponse.json(
        { 
          status: "already_processing",
          jobId: existingJob.id,
          message: "Clip generation already in progress"
        },
        { status: 202 }
      );
    }

    // Create job
    const job = await prisma.job.create({
      data: {
        type: "CLIPS",
        videoId,
        status: "pending",
      },
    });

    // Update video status
    await prisma.video.update({
      where: { id: videoId },
      data: { status: "processing" },
    });

    // Add job to queue
    await clipsQueue.add(
      "clips-queue",
      { videoId },
      {
        jobId: job.id,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: false,
        removeOnFail: false,
      }
    );

    // Respond immediately
    return NextResponse.json(
      {
        status: "accepted",
        jobId: job.id,
        message: "Clip generation started"
      },
      { status: 202 }
    );

  } catch (error: any) {
    console.error("Clips API error:", error);
    return NextResponse.json(
      { error: error.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}

// GET endpoint to check clip generation status
export async function GET(
  req: Request,
  { params }: { params: { videoId: string } }
) {
  try {
    // Extract ID manually from URL
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    const videoId = segments[segments.length - 2];

    if (!videoId) {
      return NextResponse.json(
        { error: "videoId required" },
        { status: 400 }
      );
    }

    // Get latest job
    const job = await prisma.job.findFirst({
      where: {
        videoId,
        type: "CLIPS",
      },
      orderBy: { createdAt: "desc" },
    });

    // Get clips
    const clips = await prisma.clip.findMany({
      where: { videoId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      job: job ? {
        id: job.id,
        status: job.status,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      } : null,
      clips: clips.map(clip => ({
        id: clip.id,
        title: clip.title,
        startTime: clip.startTime,
        endTime: clip.endTime,
        format: clip.format,
        filePath: clip.filePath,
        createdAt: clip.createdAt,
      })),
      totalClips: clips.length,
    });

  } catch (error: any) {
    console.error("Clips GET API error:", error);
    return NextResponse.json(
      { error: error.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}