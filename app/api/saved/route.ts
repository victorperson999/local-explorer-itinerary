export const runtime = "nodejs"
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const DEMO_USER = "demo"; // temp user; we’ll replace with real auth later

export async function GET() {
  const saved = await prisma.savedPlace.findMany({
    where: { savedBy: DEMO_USER },
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
    create: { provider, providerId, name, address: address ?? null, category: category ?? null },
  });

  await prisma.savedPlace.upsert({
    where: { savedBy_placeId: { savedBy: DEMO_USER, placeId: place.id } },
    update: {},
    create: { savedBy: DEMO_USER, placeId: place.id },
  });

  return NextResponse.json({ ok: true, placeId: place.id });
}

export async function DELETE(req: Request) {
  const body = await req.json();
  const { placeId } = body ?? {};

  if (!placeId) {
    return NextResponse.json({ error: "placeId required" }, { status: 400 });
  }

  await prisma.savedPlace.deleteMany({
    where: { savedBy: DEMO_USER, placeId },
  });

  return NextResponse.json({ ok: true });
}
