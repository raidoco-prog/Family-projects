"use client";

/**
 * Browser-side push subscription.
 *
 * On iPhone this only works once the site has been added to the home
 * screen — Safari exposes no Push API in a normal tab. Everything here
 * checks for that first so the UI can explain, rather than fail silently.
 */

export type PushState =
  | "unsupported"       // no Push API at all
  | "needs-install"     // iOS, not yet added to the home screen
  | "denied"            // the user said no
  | "granted"           // subscribed
  | "available";        // can be enabled

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS reports it here rather than through display-mode.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac, but with a touch screen.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";

  const hasApi = "serviceWorker" in navigator && "PushManager" in window;
  if (!hasApi) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (isIos() && !isStandalone()) return "needs-install";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "granted") {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? "granted" : "available";
  }
  return "available";
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export interface SubscribeResult {
  ok: boolean;
  error?: string;
  subscription?: { endpoint: string; p256dh: string; auth: string };
}

export async function subscribeToPush(vapidPublicKey: string): Promise<SubscribeResult> {
  if (!vapidPublicKey) return { ok: false, error: "מפתח ההתראות לא מוגדר בשרת." };

  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, error: "ההרשאה נדחתה. אפשר לשנות בהגדרות הדפדפן." };
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });

    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
      return { ok: false, error: "המנוי נוצר חלקית. נסו שוב." };
    }

    return {
      ok: true,
      subscription: { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "ההרשמה נכשלה." };
  }
}

export async function unsubscribeFromPush(): Promise<string | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
