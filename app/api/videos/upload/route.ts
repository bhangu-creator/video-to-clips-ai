import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("video") as File;

    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Ensure upload directory exists
    const uploadDir = path.join(process.cwd(), "uploads/original");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const tempFilePath = path.join(uploadDir, file.name);
    fs.writeFileSync(tempFilePath, buffer);

    // Save metadata to DB
    const relativePath = `uploads/original/${file.name}`;

    const video = await prisma.video.create({
    data: {
        filename: file.name,
        filePath: relativePath,
        duration: 0,          // placeholder
        status: "uploaded",   // pipeline state
    },
    });


    return Response.json({
      message: "Upload successful",
      videoId: video.id,
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
