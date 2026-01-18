import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clipsQueue } from "@/lib/queue/clips.queue";

// POST API to start clip generation for a video
export async function POST(
  req: Request,
  { params }: { params: { videoId: string } }
) {
  try {

    // Extract videoId from request URL
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    const videoId = segments[segments.length - 2]; 

    // Return error if videoId is missing
    if (!videoId) {
      return NextResponse.json(
        { error: "videoId required" },
        { status: 400 }
      );
    }

    // Check if video exists in database
    const video = await prisma.video.findUnique({
      where: { id: videoId },
    });

    // Return error if video not found
    if (!video) {
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
    }

    // Fetch latest highlights for the video
    const highlightsRecord = await prisma.highlight.findFirst({
      where: { videoId },
      orderBy: { createdAt: "desc" },
    });

    // Ensure highlights exist before generating clips
    if (!highlightsRecord) {
      return NextResponse.json(
        { error: "No highlights found for this video. Generate highlights first." },
        { status: 400 }
      );
    }

    // Check if a clip generation job is already running
    const existingJob = await prisma.job.findFirst({
      where: {
        videoId,
        type: "CLIPS",
        status: { in: ["pending", "processing"] },
      },
    });

    // Return existing job info if already processing
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

    // Create a new clip generation job
    const job = await prisma.job.create({
      data: {
        type: "CLIPS",
        videoId,
        status: "pending",
      },
    });

    // Update video status to processing
    await prisma.video.update({
      where: { id: videoId },
      data: { status: "processing" },
    });

    // Add clip generation job to queue
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

    // Respond immediately without waiting for job completion
    return NextResponse.json(
      {
        status: "accepted",
        jobId: job.id,
        message: "Clip generation started"
      },
      { status: 202 }
    );

  } catch (error: any) {
    // Handle unexpected errors
    console.error("Clips API error:", error);
    return NextResponse.json(
      { error: error.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}

// GET API to check clip generation status and results
export async function GET(
  req: Request,
  { params }: { params: { videoId: string } }
) {
  try {
    // Extract videoId from request URL
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    const videoId = segments[segments.length - 2];

    // Return error if videoId is missing
    if (!videoId) {
      return NextResponse.json(
        { error: "videoId required" },
        { status: 400 }
      );
    }

    // Fetch latest clip generation job
    const job = await prisma.job.findFirst({
      where: {
        videoId,
        type: "CLIPS",
      },
      orderBy: { createdAt: "desc" },
    });

    // Fetch all generated clips for the video
    const clips = await prisma.clip.findMany({
      where: { videoId },
      orderBy: { createdAt: "desc" },
    });

    // Return job status and clip data
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
    // Handle unexpected errors
    console.error("Clips GET API error:", error);
    return NextResponse.json(
      { error: error.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
