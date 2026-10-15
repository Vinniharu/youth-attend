"use client";

import { useEffect } from "react";

/**
 * Development only: unregisters any service worker left by a production run on the
 * same origin (`npm start` then `npm run dev`), whose cached static files would
 * otherwise shadow hot reload.
 */
export function DevServiceWorkerReset() {
  useEffect(() => {
    void navigator.serviceWorker
      ?.getRegistrations()
      .then((registrations) => registrations.forEach((r) => void r.unregister()));
  }, []);
  return null;
}
