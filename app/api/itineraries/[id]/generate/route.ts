export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import next from "next";

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

type GenerateBody = {
    placeIds?: string[];
    mode?: "replace" | "append";
    perDay?: number;
    shuffle?: boolean;
}

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

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
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

    const eligible = saved.map(
        (s) => s.place)
        .filter((p) => typeof p.lat == "number" && typeof p.lon == "number");
       
    
    if (eligible.length == 0){
        return NextResponse.json({
            ok: true,
            count: 0,
            items: [],
            debug: { savedCount: saved.length, eligibleCount: 0, reason: "No saved places with lat/lon"}
        });
    }

    // cap so we don’t dump 200 items into 3 days
    const PerDay = 3;
    const maxToCreate = Math.min(eligible.length, itinerary.daysCount * PerDay);
    const chosen = eligible.slice(0, maxToCreate);

    const created = await prisma.$transaction(async (tx) => {
        await tx.itineraryItem.deleteMany({ where: { itineraryId: id}});
        // replace
        const out = [];
        const nextOrderByDay = Array.from({ length: itinerary.daysCount }, () => 0);
         
        for (let i = 0; i<chosen.length; i++){
            const dayIndex = i % itinerary.daysCount;
            const order = nextOrderByDay[dayIndex]++;

            const item = await tx.itineraryItem.create({
                data: {
                itineraryId: id,
                placeId: chosen[i].id,
                dayIndex,
                order,
                note: null,
            },
            include: { place: true},
            });
            out.push(item)
        }
        return out;
    });

    return NextResponse.json({
        ok: true,
        count: created.length,
        items: created,
        debug: { savedCount: saved.length, 
            eligibleCount: eligible.length, 
            chosenCount: chosen.length},
    });
}
