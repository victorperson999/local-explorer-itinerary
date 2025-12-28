"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type SavedItem = {
  placeId: string;
  provider: string;
  providerId: string;
  name: string;
  address: string | null;
  category: string | null;
};

async function fetchSaved(): Promise<SavedItem[]> {
  const res = await fetch("/api/saved", { cache: "no-store" });
  if(!res.ok){
    throw new Error("Failed to load saved places")
  }
  return res.json();
}

async function savePlace(p: PlaceResult) {
  const res = await fetch("/api/saved", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      provider: p.provider,
      providerId: p.providerId,
      name: p.name,
      address: p.address,
      category: p.category,

    }),
  });
  if(!res.ok){
    throw new Error("Failed to save place");
  }
}

async function removePlace(placeId: string) {
  const res = await fetch("/api/saved", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ placeId }),
  });
  if(!res.ok){
    throw new Error("Failed to remove place");
  }
}

type PlaceResult = {
    provider: "mock" | "osm";
    providerId: string;
    name: string;
    address: string;
    category?: string;
};


export default function SearchPanel() {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<PlaceResult[]>([]);

    const [saved, setSaved] = useState<SavedItem[]>([]);
    const [savingKey, setSavingKey] = useState<string | null>(null);


    const canSearch = useMemo(() => query.trim().length > 0 && !loading, [query, loading] );

    const savedKeys = useMemo(
      () => new Set(saved.map((s) => `${s.provider}:${s.providerId}`)),
      [saved]
    );

    useEffect(() => {
      fetchSaved()
        .then(setSaved)
        .catch(() =>{

        });
    }, []);

    async function refreshSaved() {
      setSaved(await fetchSaved());
    }

    async function onSearch() {
        const q = query.trim();

        if (!q) {
            setError("Enter a city or name of neighbourhood (e.g. Toronto)");
            setResults([]);
            return;
        }
        setError(null);
        setLoading(true);
        setResults([]);


        try {
          const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`, {
            cache: "no-store",
          });

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`Failed to fetch places: ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
          }

          const data = (await res.json()) as PlaceResult[];
          setResults(data);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Search failed");
          setResults([]);
        } finally {
          setLoading(false);
        }

    }

    return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-2xl">Local Explorer</CardTitle>
        <CardDescription>
          Search a city, discover attractions, and build an itinerary. (We’ll wire a real API next.)
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try: Toronto"
            onKeyDown={(e) => {
              if (e.key === "Enter") void onSearch();
            }}
          />
          <Button onClick={onSearch} disabled={!canSearch}>
            {loading ? "Searching..." : "Search"}
          </Button>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <Separator />

        {saved.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Saved</p>
            <ul className="space-y-2">
              {saved.map((s) => (
                <li key={s.placeId} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{s.name}</p>
                      {s.address ? (
                        <p className="text-sm text-muted-foreground">{s.address}</p>
                      ) : null}
                    </div>
                      
                    <div className="flex items-center gap-2">
                      {s.category ? <Badge variant="secondary">{s.category}</Badge> : null}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={savingKey === `remove:${s.placeId}`}
                        onClick={async () => {
                          try {
                            setSavingKey(`remove:${s.placeId}`);
                            await removePlace(s.placeId);
                            await refreshSaved();
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Failed to remove place");
                          } finally {
                            setSavingKey(null);
                          }
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <Separator />
          </div>
        ) : null}


        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Results will show up here. Next step: connect a real Places API via a Next.js route handler.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Showing {results.length} results for <span className="font-medium">{query.trim()}</span>
            </p>

            <ul className="space-y-2">
              {results.map((r) => (
                <li key={r.providerId} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3"> 
                    <div>
                      <p className="font-medium">{r.name}</p>
                      <p className="text-sm text-muted-foreground">{r.address}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {r.category ? <Badge variant="secondary">{r.category}</Badge> : null}

                      <Button
                        size="sm"
                        variant={savedKeys.has(`${r.provider}:${r.providerId}`) ? "secondary" : "default"}
                        disabled={savingKey === `${r.provider}:${r.providerId}`}
                        onClick={async () => {
                          const key = `${r.provider}:${r.providerId}`;
                          try {
                            setSavingKey(key);
                            await savePlace(r);
                            await refreshSaved();
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Failed to save place");
                          } finally {
                            setSavingKey(null);
                          }
                        }}
                      >
                        {savedKeys.has(`${r.provider}:${r.providerId}`) ? "Saved" : "Save"}
                      </Button>
                    </div>
                  </div>

                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}