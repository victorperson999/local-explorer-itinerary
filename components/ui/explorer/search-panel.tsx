"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type PlaceResult = {
    provider: "mock";
    id: string;
    name: string;
    address: string;
    category?: string;
};

function mockResults(query: string): PlaceResult[] {
    const q = query.trim();

    if(!q) return [];

    // mock data below ( replace with real api call later)

    return [
  { provider: "mock", id: "1", name: `${q} Art Center`, address: `Downtown, ${q}`, category: "Museum" },
  { provider: "mock", id: "2", name: `${q} Waterfront Walk`, address: `Harbourfront, ${q}`, category: "Outdoor" },
  { provider: "mock", id: "3", name: `${q} Food Market`, address: `Market District, ${q}`, category: "Food" },
];

}

export default function SearchPanel() {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<PlaceResult[]>([]);

    const canSearch = useMemo(() => query.trim().length > 0 && !loading, [query, loading] );

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

        // network latency ( not really)
        await new Promise((r) => setTimeout(r, 250));

        setResults(mockResults(q));
        setLoading(false);
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
                <li key={r.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{r.name}</p>
                      <p className="text-sm text-muted-foreground">{r.address}</p>
                    </div>
                    {r.category ? <Badge variant="secondary">{r.category}</Badge> : null}
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