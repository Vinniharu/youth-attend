import type { Metadata } from "next";
import { Suspense } from "react";

import { GeofencePicker } from "@/components/map/geofence-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/lib/dal";
import { getDefaultLocation } from "@/lib/location";

export const metadata: Metadata = { title: "Geofence" };

// Starting point before a geofence is saved: central Lagos.
const FALLBACK = { name: "Main Auditorium", center: { lat: 6.5244, lng: 3.3792 }, radiusM: 120 };

export default function GeofencePage() {
  return (
    <div className="space-y-8">
      <div className="max-w-2xl space-y-2">
        <h1 className="text-4xl font-semibold sm:text-5xl">Church location</h1>
        <p className="text-muted-foreground">
          Members can check in when their phone is inside this circle during the service. Each new
          Sunday copies the location as it is when the session is created.
        </p>
      </div>
      <Suspense fallback={<PickerSkeleton />}>
        <Picker />
      </Suspense>
    </div>
  );
}

async function Picker() {
  await requireAdmin();
  const location = await getDefaultLocation();
  return (
    <GeofencePicker
      initial={
        location
          ? { name: location.name, center: location.center, radiusM: location.radiusM }
          : FALLBACK
      }
      saved={location !== null}
    />
  );
}

function PickerSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]" aria-busy>
      <Skeleton className="h-[55vh] min-h-80 rounded-2xl lg:h-[calc(100dvh-14rem)] lg:min-h-[32rem]" />
      <div className="space-y-5">
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
      </div>
    </div>
  );
}
