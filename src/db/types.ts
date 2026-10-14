import { customType } from "drizzle-orm/pg-core";

import { type LatLng, parseWkbPoint, pointSql } from "./point";

/** `geography(Point, 4326)`; app code works with `{ lat, lng }` and real metres. */
export const geographyPoint = customType<{ data: LatLng; driverData: string }>({
  dataType: () => "geography(Point, 4326)",
  toDriver: (value) => pointSql(value),
  fromDriver: (value) => parseWkbPoint(value),
});

/** Case-insensitive text (requires the `citext` extension). */
export const citext = customType<{ data: string }>({
  dataType: () => "citext",
});
