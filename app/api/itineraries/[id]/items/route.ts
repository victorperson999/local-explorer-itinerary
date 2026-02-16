export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

import { redis } from "@/lib/redis";

async function requireUserId() {
  const session = await getServerSession(authOptions);
  const id = (session?.user as any)?.id as string | undefined;
  return id ?? null;
}

const ITEMS_TLL_SECONDS = 60 *5;
function itemsCacheKey(userId: string, itineraryId: string){
    return `itineraryItems:v1:user=${userId}:itinerary=${itineraryId}`;
}

async function cacheGetJSON<T>(key: string): Promise<T | null> {
    if (!redis){
        return null;
    }
    const raw = await (redis as any).get(key);
    if (!raw){
        return null;
    }
    return typeof raw === "string" ? (JSON.parse(raw) as T): (raw as T);
}

async function cacheSetJson(key: string, value: unknown, ttlSeconds: number) {
    if (!redis){
        return;
    }

    const payload = JSON.stringify(value);
    try{
        await (redis as any).set(key, payload, { ex: ttlSeconds});
        return;
    }catch{}
    try{
        await (redis as any).set(key, payload, { EX: ttlSeconds});
        return;
    }catch{}
    try{
        await (redis as any).set(key, payload, "EX", ttlSeconds);
        return;
    }catch{}

    //fallback
    await (redis as any).set(key, payload);
}

async function cacheDel(key: string) {
    if (!redis){return}
    await (redis as any).del(key);
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }>}) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const key = itemsCacheKey(userId, id);

  // try cache first
  const cached = await cacheGetJSON<any[]>(key);
  if (cached){
    return NextResponse.json(cached, { headers: { "x-cache": "HIT"}});
  }

  // Make sure itinerary belongs to user (miss case)
  const itinerary = await prisma.itinerary.findFirst({ where: { id, userId } });
  if (!itinerary) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const items = await prisma.itineraryItem.findMany({
    where: { itineraryId: id },
    include: { place: true },
    orderBy: [{ dayIndex: "asc" }, { order: "asc" }],
  });

  await cacheSetJson(key, items, ITEMS_TLL_SECONDS);

  return NextResponse.json(items, { headers: { "x-cache": "MISS"}});
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }>}) {
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await ctx.params;

    const itinerary = await prisma.itinerary.findFirst({ where: { id, userId } });
    if (!itinerary) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const raw = await req.text();

    let body: any;
    try {
        body = raw ? JSON.parse(raw) : {};
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body", raw: raw.slice(0, 300) },
            { status: 400 }
        );
    }


    const placeId = typeof body?.placeId === "string" ? body.placeId.trim() : "";
    const dayIndex = Number(body?.dayIndex); // don't default yet

    if (!placeId) {
        return NextResponse.json(
            { error: "placeId required", received: body },
            { status: 400 }
        );
    }

    if (!Number.isInteger(dayIndex)) {
        return NextResponse.json({ error: "dayIndex required" }, { status: 400 });
    }
    if (dayIndex < 0 || dayIndex >= itinerary.daysCount) {
        return NextResponse.json({ error: "Invalid dayIndex" }, { status: 400 });
    }


    // append to end of that day
    const last = await prisma.itineraryItem.findFirst({
        where: { itineraryId: id, dayIndex },
        orderBy: { order: "desc" },
        select: { order: true },
    });
    const nextOrder = (last?.order ?? -1) + 1;

    const note = 
        typeof body?.note == "string" && body.note.trim().length > 0 
        ? body.note.trim() 
        : null;

    const created = await prisma.itineraryItem.create({
        data: { 
            itineraryId: id, 
            placeId, 
            dayIndex, 
            order: nextOrder, 
            note 
            },
        include: { place: true },
    });
    await cacheDel(itemsCacheKey(userId, id));

    return NextResponse.json(created);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }>}) {
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    const itinerary = await prisma.itinerary.findFirst({ where: { id, userId } });
    if (!itinerary) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const itemId = body?.itemId as string | undefined;
    if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

    await prisma.itineraryItem.deleteMany({
        where: { id: itemId, itineraryId: id },
    });

    await cacheDel(itemsCacheKey(userId, id));

    return NextResponse.json({ ok: true });
}
