// Check-in API shapes, shared by the route handlers and the member UI. Client-safe.

export type CheckinMethod = "auto_geofence" | "qr_scan" | "manual_admin";

export type CheckinFailureReason =
  | "NO_OPEN_SESSION"
  | "OUTSIDE_GEOFENCE"
  | "LOW_ACCURACY"
  | "INVALID_QR"
  | "EXPIRED_QR"
  | "RATE_LIMITED"
  | "UNAUTHENTICATED";

export type CheckinResult =
  | {
      ok: true;
      alreadyCheckedIn: boolean;
      checkedInAt: string;
      /** How the member was counted; an earlier manual check-in counts too. */
      method: CheckinMethod;
    }
  /** Distance from the church centre, and the session's radius (metres). */
  | { ok: false; reason: "OUTSIDE_GEOFENCE"; distanceM: number; radiusM: number }
  /** The reading's accuracy, and the most the server accepts (metres). */
  | { ok: false; reason: "LOW_ACCURACY"; accuracyM: number; maxAccuracyM: number }
  /** Seconds until another attempt is allowed. */
  | { ok: false; reason: "RATE_LIMITED"; retryAfterS: number }
  | {
      ok: false;
      reason: Exclude<CheckinFailureReason, "OUTSIDE_GEOFENCE" | "LOW_ACCURACY" | "RATE_LIMITED">;
    };

/** A service as the member home shows it. Times are ISO strings. */
export type MemberSession = {
  id: string;
  serviceDate: string;
  startsAt: string;
  endsAt: string;
};

export type MemberStatus = {
  /** The session open for check-in right now, if any. */
  current:
    (MemberSession & { checkIn: { checkedInAt: string; method: CheckinMethod } | null }) | null;
  /** The next session that hasn't ended, when nothing is open now. */
  next: MemberSession | null;
};
