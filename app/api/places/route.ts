export const runtime = "nodejs";

import { NextResponse } from "next/server";

type Place = {
  provider: "osm";
  providerId: string;
  name: string;
  address: string;
  category?: string;
  lat?: number;
  lon?: number;
};

type NominatimResult = { lat: string; lon: string };

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

function categoryFromTags(tags?: Record<string, string>): string | undefined {
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

  return map[t] ?? (t.length ? t[0].toUpperCase() + t.slice(1) : undefined);
}

function addressFromTags(tags?: Record<string, string>): string {
  if (!tags) return "";
  const parts = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return tags["addr:full"] ?? "";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 15), 25);

  if (!q) return NextResponse.json([]);

  // 1) Geocode (Nominatim)
  const geoUrl =
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;

  const geoRes = await fetch(geoUrl, {
    headers: { "User-Agent": "local-explorer-itinerary-planner (dev)" },
    cache: "no-store",
  });

  if (!geoRes.ok) {
    return NextResponse.json({ error: "Geocoding failed" }, { status: 502 });
  }

  const geo = (await geoRes.json()) as NominatimResult[];
  if (!geo.length) return NextResponse.json([]);

  const lat = Number(geo[0].lat);
  const lon = Number(geo[0].lon);

  // 2) Nearby POIs (Overpass)
  const radius = 5000;
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
    const text = await overRes.text().catch(() => "");
    return NextResponse.json(
      {
        error: "Places query failed",
        overpassStatus: overRes.status,
        overpassStatusText: overRes.statusText,
        details: text.slice(0, 400),
      },
      { status: 502 }
    );
  }

  const data = (await overRes.json()) as OverpassResponse;
  const elements = data.elements ?? [];

  const results: Place[] = elements.flatMap((el) => {
    const tags = el.tags;
    const name = tags?.name;
    if (!name) return [];

    const providerId = `${el.type}/${el.id}`;
    const cLat = typeof el.lat === "number" ? el.lat : el.center?.lat;
    const cLon = typeof el.lon === "number" ? el.lon : el.center?.lon;
    const category = categoryFromTags(tags);

    // Build with OPTIONAL fields omitted when undefined (fixes your TS predicate errors)
    const out: Place = {
      provider: "osm",
      providerId,
      name,
      address: addressFromTags(tags),
      ...(category ? { category } : {}),
      ...(typeof cLat === "number" ? { lat: cLat } : {}),
      ...(typeof cLon === "number" ? { lon: cLon } : {}),
    };

    return [out];
  });

  return NextResponse.json(results);
}
