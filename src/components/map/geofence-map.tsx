"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

import type { LatLng } from "@/db/point";

// Client-only: Leaflet touches `window` on import. Load through next/dynamic with
// ssr: false (see geofence-picker.tsx).

// A divIcon instead of Leaflet's default PNG marker, whose image URLs break under
// bundlers. Styled by .geofence-pin in globals.css (theme tokens).
const pin = L.divIcon({
  className: "geofence-pin",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

type GeofenceMapProps = {
  center: LatLng;
  radiusM: number;
  /** Changes when the centre moves from outside the map (search, my location). */
  focusKey: number;
  onCenterChange: (center: LatLng) => void;
};

export default function GeofenceMap({
  center,
  radiusM,
  focusKey,
  onCenterChange,
}: GeofenceMapProps) {
  const position = useMemo<[number, number]>(() => [center.lat, center.lng], [center]);

  return (
    <MapContainer
      center={position}
      zoom={17}
      scrollWheelZoom
      className="geofence-map size-full"
      attributionControl
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      <Circle
        center={position}
        radius={radiusM}
        // Colours come from .geofence-circle in globals.css: SVG attributes can't read CSS variables.
        pathOptions={{ className: "geofence-circle", weight: 2, fillOpacity: 0.12 }}
      />
      <Marker
        position={position}
        icon={pin}
        draggable
        keyboard
        title="Church location. Drag to move."
        eventHandlers={{
          dragend: (event) => {
            // wrap(): a drag onto a repeated world copy would give e.g. lng 363.
            const { lat, lng } = (event.target as L.Marker).getLatLng().wrap();
            onCenterChange({ lat, lng });
          },
        }}
      />
      <ClickToMove onCenterChange={onCenterChange} />
      <FlyTo center={position} focusKey={focusKey} />
    </MapContainer>
  );
}

function ClickToMove({ onCenterChange }: Pick<GeofenceMapProps, "onCenterChange">) {
  useMapEvents({
    click: (event) => {
      const { lat, lng } = event.latlng.wrap();
      onCenterChange({ lat, lng });
    },
  });
  return null;
}

/** Pans to the centre after a search or "use my location" (not after drags or clicks). */
function FlyTo({ center, focusKey }: { center: [number, number]; focusKey: number }) {
  const map = useMap();
  useEffect(() => {
    if (focusKey === 0) return;
    map.flyTo(center, Math.max(map.getZoom(), 17), { duration: 0.8 });
    // Only react to explicit focus requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);
  return null;
}
