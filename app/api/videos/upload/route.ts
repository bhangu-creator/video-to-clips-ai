import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

// POST API to upload a video file
export async function POST(req: Request) {
  try {
    // Read form data from request
    const formData = await req.formData();
    const file = formData.get("video") as File;

    // Return error if no file is provided
    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Ensure upload directory exists
    const uploadDir = path.join(process.cwd(), "uploads/original");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Convert uploaded file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Save file to disk
    const tempFilePath = path.join(uploadDir, file.name);
    fs.writeFileSync(tempFilePath, buffer);

    // Store relative file path in database
    const relativePath = `uploads/original/${file.name}`;

    // Create video record in database
    const video = await prisma.video.create({
      data: {
        filename: file.name,
        filePath: relativePath,
        duration: 0,          // placeholder value
        status: "uploaded",   // current pipeline state
      },
    });

    // Return success response with video ID
    return Response.json({
      message: "Upload successful",
      videoId: video.id,
    });
  } catch (err) {
    // Handle unexpected errors
    console.error(err);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
