import { prisma } from "@/lib/prisma";

export async function GET() {
  const count = await prisma.video.count();
  return Response.json({ ok: true, videos: count });
}
