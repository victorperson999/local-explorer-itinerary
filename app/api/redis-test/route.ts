import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";
// GET is temporarily for firsttime redis wiring setup
export async function GET() {
    await redis.set("hello", "world", {EX: 60});
    const v = await redis.get("hello");
    return Response.json({ok: true, value: v})
}