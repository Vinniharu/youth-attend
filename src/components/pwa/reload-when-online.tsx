"use client";

import { useEffect } from "react";

/** On the offline page: reload as soon as the connection returns. */
export function ReloadWhenOnline() {
  useEffect(() => {
    const reload = () => window.location.reload();
    window.addEventListener("online", reload);
    return () => window.removeEventListener("online", reload);
  }, []);
  return null;
}
