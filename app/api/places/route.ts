import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Place = {
  provider: "osm";
  providerId: string;
  name: string;
  address: string;
  category?: string;
  lat?: number;
  lon?: number;
};

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};


function categoryFromTags(tags: Record<string, string> | undefined): string | undefined {
  if (!tags) return undefined;
  const t = tags.tourism || tags.amenity || tags.leisure;
  if (!t) return undefined;

  const map: Record<string, string> = {
    museum: "Museum",
    attraction: "Attraction",
    gallery: "Gallery",
    park: "Park",
    cafe: "Cafe",
    restaurant: "Food",
  };

  return map[t] ?? t[0].toUpperCase() + t.slice(1);
}

function addressFromTags(tags: Record<string, string> | undefined): string {
  if (!tags) return "";
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:city"],
  ].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return tags["addr:full"] ?? "";
}
// speed up search via caching so it doesnt take 10 seconds to result in a search
const CACHE_TTL_MS = 5*60*1000;

type CacheEntry = {
    ts: number;
    data: Place[];
};

const globalForCache = globalThis as unknown as {
    placesCache?: Map<string, CacheEntry>;
}

const placesCache = globalForCache.placesCache ?? new Map<string, CacheEntry>();
if (process.env.NODE_ENV ! == "production") {
    globalForCache.placesCache = placesCache;
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    const limit = Math.min(Number(searchParams.get("limit") ?? 15), 25);

    const cacheKey = `${q.toLowerCase()}|${limit}`;
    const hit = placesCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS){
    return NextResponse.json(hit.data);
    }

    if (!q) return NextResponse.json([]);

    // 1) Geocode city -> lat/lon (Nominatim)
    const geoUrl =
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;

    const geoRes = await fetch(geoUrl, {
    headers: { "User-Agent": "local-explorer-itinerary-planner (dev)" },
    cache: "no-store",
    });

    if (!geoRes.ok) {
    return NextResponse.json({ error: "Geocoding failed" }, { status: 502 });
    }

    const geo = (await geoRes.json()) as Array<{ lat: string; lon: string }>;
    if (!geo.length) return NextResponse.json([]);

    const lat = Number(geo[0].lat);
    const lon = Number(geo[0].lon);

    // 2) Nearby POIs (Overpass)
    const radius = 5000; // meters
    const overpassQuery = `
    [out:json][timeout:25];
    (
    node["name"]["tourism"~"attraction|museum|gallery"](around:${radius},${lat},${lon});
    way["name"]["tourism"~"attraction|museum|gallery"](around:${radius},${lat},${lon});
    relation["name"]["tourism"~"attraction|museum|gallery"](around:${radius},${lat},${lon});
    node["name"]["leisure"="park"](around:${radius},${lat},${lon});
    );
    out center ${limit};
    `;

    const overRes = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
        "Content-Type": "text/plain",
        "User-Agent": "local-explorer-itinerary-planner (dev)",
    },
    body: overpassQuery,
    cache: "no-store",
    });

    if (!overRes.ok) {
    return NextResponse.json({ error: "Places query failed" }, { status: 502 });
    }

    const data = (await overRes.json()) as OverpassResponse;

    const results: Place[] = (data.elements ?? [])
    .flatMap((el) => {
        const tags = el.tags;
        const name = tags?.name;
        if (!name) return [];

        const id = `${el.type}/${el.id}`;
        const cLat = typeof el.lat === "number" ? el.lat : el.center?.lat;
        const cLon = typeof el.lon === "number" ? el.lon : el.center?.lon;

        const place: Place = {
        provider: "osm",
        providerId: id,
        name,
        address: addressFromTags(tags),
        category: categoryFromTags(tags),
        lat: cLat,
        lon: cLon,
        };
        return [place]
    });

    placesCache.set(cacheKey, { ts: Date.now(), data: results})

    return NextResponse.json(results);
}
