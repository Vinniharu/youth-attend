// Browser helpers for calling the app's JSON API. Client-safe.

const MESSAGES: Record<string, string> = {
  NO_LOCATION: "Set the church location first. New sessions copy it.",
  SESSION_EXISTS: "There's already a session on that date.",
  NOT_FOUND: "That session no longer exists. Refresh the page.",
  INVALID_TRANSITION: "That change isn't possible from the session's current status.",
  LOCKED: "This session is finished and can't be changed.",
  INVALID_INPUT: "Check the details and try again.",
  UNAUTHENTICATED: "Your session has ended. Sign in again.",
  FORBIDDEN: "Only admins can do that.",
};

/** Sends JSON and returns null on success, or a message to show the user. */
export async function sendJson(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body: unknown,
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return null;
    const { error } = (await response.json().catch(() => ({}))) as { error?: string };
    return (error && MESSAGES[error]) || "Something went wrong. Try again.";
  } catch {
    return "Couldn't reach Pulse. Check your connection and try again.";
  }
}
