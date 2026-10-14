import { z } from "zod";

// Input schemas shared by API routes (validation at the boundary) and client forms.
// Client-safe: no database or server imports.

/** Validated coordinates. Reused at every API boundary that accepts a location. */
export const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** Geofence radius limits: the picker's slider range, and the database's hard limits. */
export const RADIUS_SLIDER = { min: 20, max: 500 } as const;
export const RADIUS_DB = { min: 20, max: 2000 } as const;

export const locationInput = z.object({
  name: z.string().trim().min(1, "Give the location a name").max(80),
  center: pointSchema,
  radiusM: z.number().int().min(RADIUS_DB.min).max(RADIUS_DB.max),
});
export type LocationInput = z.infer<typeof locationInput>;

/** Local wall-clock time, 24-hour "HH:mm". */
export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");

const window = z
  .object({ start: timeOfDay, end: timeOfDay })
  .refine((w) => w.end > w.start, { message: "End must be after start", path: ["end"] });

export const createSessionInput = z
  .object({ serviceDate: z.iso.date(), start: timeOfDay, end: timeOfDay })
  .refine((s) => s.end > s.start, { message: "End must be after start", path: ["end"] });
export type CreateSessionInput = z.infer<typeof createSessionInput>;

/**
 * Status changes an admin can make ("scheduled" restores a cancelled session).
 * "processed" belongs to the absence engine.
 */
export const ADMIN_STATUS_CHANGES = ["scheduled", "open", "closed", "cancelled"] as const;

export const updateSessionInput = z
  .object({
    window: window.optional(),
    status: z.enum(ADMIN_STATUS_CHANGES).optional(),
  })
  .refine((u) => u.window || u.status, { message: "Nothing to change" });
export type UpdateSessionInput = z.infer<typeof updateSessionInput>;
