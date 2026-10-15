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

/** A GPS reading from the browser. `accuracy` is the 68% radius in metres. */
export const checkinInput = pointSchema.extend({
  // No upper bound: a coarse fix (even an IP-based one) must reach LOW_ACCURACY, not a 400.
  accuracy: z.number().positive(),
});
export type CheckinInput = z.infer<typeof checkinInput>;

/** A QR check-in: the scanned token plus a GPS reading. */
export const qrCheckinInput = checkinInput.extend({ token: z.string().min(1).max(200) });

/** An admin marking a member present. */
export const manualCheckinInput = z.object({ sessionId: z.uuid(), userId: z.uuid() });

/** Member preferences (PATCH /api/me/preferences). */
export const preferencesInput = z.object({ emailNotifications: z.boolean() });

/** The signed unsubscribe link's parameters. */
export const unsubscribeInput = z.object({
  u: z.uuid(),
  s: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
});

const memberFields = {
  name: z.string().trim().min(1, "Enter a name").max(100),
  email: z.email("Enter a valid email").trim().toLowerCase().max(254),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+\d][\d\s()-]*$/, "Use digits, spaces and an optional leading +")
    .or(z.literal(""))
    .optional(),
  role: z.enum(["member", "admin"]).default("member"),
};

/** Adding a member (admins add members; there is no open sign-up). */
export const newMemberInput = z.object(memberFields);
export type NewMemberInput = z.infer<typeof newMemberInput>;

/** Editing a member: any subset of the fields, plus deactivation. */
export const memberChangeInput = z
  .object({
    name: memberFields.name.optional(),
    email: memberFields.email.optional(),
    phone: memberFields.phone,
    role: z.enum(["member", "admin"]).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((c) => Object.keys(c).length > 0, { message: "Nothing to change" });
export type MemberChangeInput = z.infer<typeof memberChangeInput>;

/** Excusing (or un-excusing) a member from one session. */
export const excusalInput = z.object({
  sessionId: z.uuid(),
  userId: z.uuid(),
  reason: z.string().trim().max(200).optional(),
});

/** Follow-up changes: notes, assignment, or resolving. */
export const followUpChangeInput = z
  .object({
    id: z.uuid(),
    notes: z.string().max(2000).nullable().optional(),
    assignedTo: z.uuid().nullable().optional(),
    resolve: z.literal(true).optional(),
  })
  .refine((c) => c.notes !== undefined || c.assignedTo !== undefined || c.resolve, {
    message: "Nothing to change",
  });
