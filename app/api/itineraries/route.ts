export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

async function requireUserId() {
  const session = await getServerSession(authOptions);
  const id = (session?.user as any)?.id as string | undefined;
  return id ?? null;
}

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const itineraries = await prisma.itinerary.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(itineraries);
}

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = String(body?.title ?? "My Trip");
  const daysCount = Math.max(1, Math.min(Number(body?.daysCount ?? 3), 30));
  const startDate = body?.startDate ? new Date(body.startDate) : null;

  try {
    const created = await prisma.itinerary.create({
      data: { userId, title, daysCount, startDate },
    });
    return NextResponse.json(created);
  } catch (e: any){
      if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "Itinerary with this name already exists" },
        { status: 409 }
      );
    }
    throw e;
  }

}

