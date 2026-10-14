"use client";

import { Crosshair, MapPin, Search } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import type { LatLng } from "@/db/point";
import { sendJson } from "@/lib/api-client";
import { locationInput, RADIUS_SLIDER } from "@/lib/schemas";

const GeofenceMap = dynamic(() => import("./geofence-map"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
});

// Nominatim's usage policy: at most 1 request per second, and no as-you-type
// autocomplete. Search runs only on submit.
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const SEARCH_GAP_MS = 1100;

type SearchResult = { id: number; label: string; center: LatLng };
type NominatimHit = { place_id: number; display_name: string; lat: string; lon: string };

export type GeofenceValue = { name: string; center: LatLng; radiusM: number };

type GeofencePickerProps = {
  /** The saved geofence, or a starting point when none is saved yet. */
  initial: GeofenceValue;
  saved: boolean;
};

export function GeofencePicker({ initial, saved }: GeofencePickerProps) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [baseline, setBaseline] = useState(saved ? initial : null);
  const [focusKey, setFocusKey] = useState(0);
  const [saving, startSaving] = useTransition();

  const dirty =
    !baseline ||
    baseline.name !== value.name ||
    baseline.radiusM !== value.radiusM ||
    baseline.center.lat !== value.center.lat ||
    baseline.center.lng !== value.center.lng;

  const moveTo = (center: LatLng, focus = false) => {
    setValue((v) => ({ ...v, center }));
    if (focus) setFocusKey((k) => k + 1);
  };

  const save = () =>
    startSaving(async () => {
      const parsed = locationInput.safeParse(value);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Check the details and try again.");
        return;
      }
      const problem = await sendJson("/api/admin/location", "PUT", parsed.data);
      if (problem) {
        toast.error(problem);
        return;
      }
      setBaseline(parsed.data);
      setValue(parsed.data);
      toast.success("Location saved. New sessions will use it.");
      router.refresh();
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="relative h-[55vh] min-h-80 overflow-hidden rounded-2xl border shadow-sm lg:h-[calc(100dvh-14rem)] lg:min-h-[32rem]">
        <GeofenceMap
          center={value.center}
          radiusM={value.radiusM}
          focusKey={focusKey}
          onCenterChange={(center) => moveTo(center)}
        />
      </div>

      <div className="space-y-7">
        <PlaceSearch onPick={(center) => moveTo(center, true)} />

        <UseMyLocation onLocate={(center) => moveTo(center, true)} />

        <div className="space-y-2">
          <Label htmlFor="location-name">Name</Label>
          <Input
            id="location-name"
            value={value.name}
            maxLength={80}
            onChange={(event) => setValue((v) => ({ ...v, name: event.target.value }))}
            className="h-11 rounded-xl px-3.5 text-base"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <Label id="radius-label">Check-in radius</Label>
            <span className="tabular font-heading text-2xl font-semibold">{value.radiusM} m</span>
          </div>
          <Slider
            aria-labelledby="radius-label"
            min={RADIUS_SLIDER.min}
            // Never below the current value: a radius saved above the usual range (the
            // API allows up to 2000 m) must not be clamped by touching the slider.
            max={Math.max(RADIUS_SLIDER.max, value.radiusM)}
            step={5}
            value={[value.radiusM]}
            onValueChange={([radiusM]) =>
              setValue((v) => ({ ...v, radiusM: radiusM ?? v.radiusM }))
            }
          />
          <p className="text-sm text-muted-foreground">
            Indoor GPS is often 20 to 100 m off. A radius of 100 to 150 m suits most churches; test
            it with a real phone before Sunday.
          </p>
        </div>

        <p className="tabular flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {value.center.lat.toFixed(6)}, {value.center.lng.toFixed(6)}
        </p>

        <div className="space-y-2">
          <Button
            onClick={save}
            disabled={saving || !dirty}
            className="h-12 w-full rounded-xl text-base"
          >
            {saving ? "Saving…" : "Save location"}
          </Button>
          <p className="text-center text-sm text-muted-foreground" aria-live="polite">
            {dirty
              ? "Drag the pin or tap the map to move it."
              : "Saved. Sessions created from now on use this location."}
          </p>
        </div>
      </div>
    </div>
  );
}

function PlaceSearch({ onPick }: { onPick: (center: LatLng) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const lastSearch = useRef(0);
  // A ref, not state: it must block a second submit synchronously, before the
  // throttle wait, or two quick submits would both reach Nominatim.
  const inFlight = useRef(false);

  const search = async () => {
    const q = query.trim();
    if (q.length < 3 || inFlight.current) return;
    inFlight.current = true;
    setSearching(true);
    setError(null);
    try {
      const wait = lastSearch.current + SEARCH_GAP_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastSearch.current = Date.now();

      const url = `${NOMINATIM}?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
      const response = await fetch(url, { headers: { "accept-language": "en" } });
      if (!response.ok) throw new Error(String(response.status));
      const hits = (await response.json()) as NominatimHit[];
      setResults(
        hits.map((hit) => ({
          id: hit.place_id,
          label: hit.display_name,
          center: { lat: Number(hit.lat), lng: Number(hit.lon) },
        })),
      );
    } catch {
      setError("Search isn't available right now. Drag the pin instead.");
      setResults(null);
    } finally {
      inFlight.current = false;
      setSearching(false);
    }
  };

  return (
    <div className="space-y-2">
      <form
        role="search"
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <Label htmlFor="place-search">Find your church</Label>
        <div className="flex gap-2">
          <Input
            id="place-search"
            type="search"
            placeholder="Church name or address"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-11 rounded-xl px-3.5 text-base"
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={searching || query.trim().length < 3}
            className="h-11 rounded-xl px-3.5"
            aria-label="Search"
          >
            <Search aria-hidden />
          </Button>
        </div>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {results && results.length === 0 && (
        <p className="text-sm text-muted-foreground">No places found. Try the street or area.</p>
      )}
      {results && results.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {results.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(result.center);
                  setResults(null);
                }}
                className="w-full px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Search by{" "}
        <a
          href="https://nominatim.org"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          Nominatim
        </a>
        , data &copy; OpenStreetMap contributors.
      </p>
    </div>
  );
}

function UseMyLocation({ onLocate }: { onLocate: (center: LatLng) => void }) {
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setNote("This browser can't share its location.");
      return;
    }
    setLocating(true);
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        onLocate({ lat: coords.latitude, lng: coords.longitude });
        setNote(`Accurate to about ${Math.round(coords.accuracy)} m.`);
      },
      (error) => {
        setLocating(false);
        setNote(
          error.code === error.PERMISSION_DENIED
            ? "Location is blocked. Allow it in your browser settings, or drag the pin."
            : "Couldn't get your location. Try again, or drag the pin.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant="outline"
        onClick={locate}
        disabled={locating}
        className="h-11 w-full rounded-xl"
      >
        <Crosshair aria-hidden />
        {locating ? "Finding you…" : "Use my location"}
      </Button>
      {note && (
        <p className="tabular text-sm text-muted-foreground" aria-live="polite">
          {note}
        </p>
      )}
    </div>
  );
}
