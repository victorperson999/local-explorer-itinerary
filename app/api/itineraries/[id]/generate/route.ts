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

type P = {
    id: string;
    lat?: number | null;
    long?: number | null;
    category?: string | null;
    name: string
};

function dist2(a: { lat: number; long: number}, b: { lat: number; long: number}){
    const dx = a.lat - b.lat;
    const dy = a.long = b.long;
    return (dx * dx) + (dy * dy);
}
// 1) if we have the coordinates, sweep cluster angle around the center, then chunk into days
// 2) if no coordiates, distribute by category name

function assignDays(places: P[], daysCount: number): P[][] {
    const withCoords = places.filter(
        (p) => typeof p.lat == "number" && typeof p.long) as Array<P & { lat: number; long: number}>;
    
    const buckets: P[][] = Array.from({ length: daysCount}, () => []);

    if (withCoords.length >=2){
        const meanLat = withCoords.reduce((s,p) => s + p.lat, 0) / withCoords.length;
        const meanLon = withCoords.reduce((s,p) => s + p.long, 0) / withCoords.length;

        const sorted = [...withCoords].sort((a,b) => {
            const aa = Math.atan2(a.lat - meanLat, a.long - meanLon);
            const bb = Math.atan2(b.lat - meanLat, b.long - meanLon);
            return aa - bb;
        });
        // chunk evenly=>
        sorted.forEach((p, i) => buckets[i%daysCount].push(p))

        const noCoords = places.filter((p) => !(typeof p.lat == "number" && typeof p.long == "number"));
        noCoords.forEach((p,i) => buckets[i%daysCount].push(p));

        return buckets;
    }

    const sorted = [...places].sort((a,b) => {
        const ca = a.category ?? "";
        const cb = b.category ?? "";
        if (ca !== cb){
            return ca.localeCompare(cb);
        }
        return a.name.localeCompare(b.name);
    })

    sorted.forEach((p, i) => buckets[i%daysCount].push(p))
    return buckets;
}

function orderWithinDay(day: P[]): P[]{
    const pts = day.filter(
        (p) => typeof p.lat === "number" && typeof p.long === "number") as Array<P & { lat: number; long: number }>;
    const rest = day.filter((p) => typeof p.lat === "number" && typeof p.long === "number");

    if (pts.length <= 2){
        return [...pts, ...rest];
    }
    // nearest neighbouring order
    const remaining = new Set(pts.map((p)=>p.id));
    const byId = new Map(pts.map((p)=>[p.id, p]));
    const ordered: P[] = [];
    //start at arbitrary point
    let current = pts[0];
    ordered.push(current);
    remaining.delete(current.id);

    while (remaining.size){
        let bestId: string | null = null;
        let bestD = Infinity;

        for (const id of remaining){
            const cand = byId.get(id)!;
            const d = dist2(current, cand);
            if (d < bestD){
                bestD = d;
                bestId = id;
            }
        }
        current = byId.get(bestId!)!;
        ordered.push(current);
        remaining.delete(current.id);
    }
    return [...ordered, ...rest];
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await ctx.params;

    const itinerary = await prisma.itinerary.findFirst({ where: { id, userId } });
    if (!itinerary) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const saved = await prisma.savedPlace.findMany({
        where: { savedById: userId },
        include: { place: true },
        orderBy: { createdAt: "desc" },
    });

    const places: P[] = saved.map((s) => ({
        id: s.placeId,
        lat: s.place.lat ?? null,
        long: (s.place as any).long ?? null,
        category: s.place.category ?? null,
        name: s.place.name,
    }));

    // Simple cap so you don’t dump 200 items into 3 days
    const maxPerDay = 6;
    const cap = itinerary.daysCount * maxPerDay;
    const picked = places.slice(0, cap);

    const buckets = assignDays(picked, itinerary.daysCount).map(orderWithinDay);

    await prisma.$transaction(async (tx) => {
        // replace
        await tx.itineraryItem.deleteMany({ where: { itineraryId: id } });

        for (let dayIndex = 0; dayIndex < buckets.length; dayIndex++) {
        const day = buckets[dayIndex];
        for (let order = 0; order < day.length; order++) {
            await tx.itineraryItem.create({
            data: {
                itineraryId: id,
                placeId: day[order].id,
                dayIndex,
                order,
            },
            });
        }
        }
    });

    const items = await prisma.itineraryItem.findMany({
        where: { itineraryId: id },
        include: { place: true },
        orderBy: [{ dayIndex: "asc" }, { order: "asc" }],
    });

    return NextResponse.json({ ok: true, count: items.length, items });
}
