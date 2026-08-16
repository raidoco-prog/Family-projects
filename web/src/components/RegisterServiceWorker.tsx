"use client";

import { useEffect } from "react";

/**
 * Registers the service worker as soon as the app loads.
 *
 * It used to be registered only when someone turned on notifications, which
 * tied two unrelated things together: the shopping list would work offline
 * only for whoever had also enabled push. Registration is cheap and the
 * worker decides for itself what it handles.
 */
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Registration is not worth racing the first paint for.
    const id = window.setTimeout(() => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        /* an unavailable worker only costs offline support */
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  return null;
}
