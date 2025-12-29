export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

async function requireUserId() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return null;
  return userId
}


export async function GET() {
  const userId = await requireUserId();

  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const saved = await prisma.savedPlace.findMany({
    where: { savedById: userId },
    include: { place: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    saved.map((s) => ({
      placeId: s.placeId,
      savedId: s.id,
      provider: s.place.provider,
      providerId: s.place.providerId,
      name: s.place.name,
      address: s.place.address,
      category: s.place.category,
      createdAt: s.createdAt,
    }))
  );
}

export async function POST(req: Request) {
  const userId = await requireUserId();

  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { provider, providerId, name, address, category } = body ?? {};

  if (!provider || !providerId || !name) {
    return NextResponse.json(
      { error: "provider, providerId, name required" },
      { status: 400 }
    );
  }

  const place = await prisma.place.upsert({
    where: { provider_providerId: { provider, providerId } },
    update: { name, address: address ?? null, category: category ?? null },
    create: {
      provider,
      providerId,
      name,
      address: address ?? null,
      category: category ?? null,
    },
  });

  await prisma.savedPlace.upsert({
    where: { savedById_placeId: { savedById: userId, placeId: place.id } },
    update: {},
    create: { savedById: userId, placeId: place.id },
  });

  return NextResponse.json({ ok: true, placeId: place.id });
}

export async function DELETE(req: Request) {
  const userId = await requireUserId();

  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { placeId } = body ?? {};

  if (!placeId) {
    return NextResponse.json({ error: "placeId required" }, { status: 400 });
  }

  await prisma.savedPlace.deleteMany({
    where: { savedById: userId, placeId },
  });

  return NextResponse.json({ ok: true });
}
