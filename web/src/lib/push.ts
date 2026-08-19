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
    return (await currentSubscription()) ? "granted" : "available";
  }
  return "available";
}

export interface DeviceSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function read(sub: PushSubscription | null | undefined): DeviceSubscription | null {
  if (!sub) return null;
  const json = sub.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return null;
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

/**
 * What this device is subscribed as, if anything.
 *
 * A browser keeps its subscription across visits and across sign-ins, and
 * it does not care whether the server ever heard about it. That gap is
 * what let this screen say "notifications on" over "0 devices registered":
 * two answers from two different places, neither wrong on its own. Reading
 * the subscription back out is what makes the two comparable — and the
 * values here are the same ones the server needs, so the gap can be
 * closed rather than only reported.
 */
export async function currentSubscription(): Promise<DeviceSubscription | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return read(await reg?.pushManager.getSubscription());
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  if (x.length !== b.length) return false;
  return x.every((v, i) => v === b[i]);
}

/**
 * The subscription this device holds, but only if the app can still push to
 * it — otherwise a current one, made on the spot.
 *
 * A subscription is bound to the application key it was created with, and
 * the push service enforces that: sign with a different pair and Apple
 * answers `badJwtToken`, having accepted the subscription happily for
 * months. Nothing about the device looks wrong, so it reads as "the keys
 * are broken" rather than "this one device is on an old key".
 *
 * This app generated its key pair after some devices had already
 * subscribed, which is exactly how a device ends up stranded. Re-checking
 * costs one comparison, permission has already been granted so no prompt
 * appears, and the alternative is registering an endpoint that can never
 * be delivered to.
 */
export async function currentSubscriptionForKey(
  vapidPublicKey: string,
): Promise<{ subscription: DeviceSubscription | null; replaced: string | null }> {
  const nothing = { subscription: null, replaced: null };
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return nothing;
  if (!vapidPublicKey) return nothing;

  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return nothing;

  const wanted = urlBase64ToUint8Array(vapidPublicKey);
  const existing = await reg.pushManager.getSubscription();
  let replaced: string | null = null;

  if (existing) {
    if (sameKey(existing.options?.applicationServerKey, wanted)) {
      return { subscription: read(existing), replaced: null };
    }
    // Reported, not just discarded. The server still holds a row for this
    // endpoint, and a row nothing can be delivered to is worse than an
    // absent one: a test push counts it as sent, so the screen says the
    // notification went out while the phone shows nothing.
    replaced = existing.endpoint;
    await existing.unsubscribe();
  }

  try {
    const fresh = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: wanted as BufferSource,
    });
    return { subscription: read(fresh), replaced };
  } catch {
    // Re-subscribing can fail on its own — offline, or a push service
    // having a bad day. The old endpoint is genuinely gone either way, so
    // it is still worth clearing; the next visit subscribes again.
    return { subscription: null, replaced };
  }
}

/**
 * Whether a prompt has anything to say about this device.
 *
 * "granted" means it is already on and "unsupported" means no amount of
 * tapping would change that, so both are silence. Kept out of the
 * component so the promise it makes — say nothing when there is nothing
 * to do — is something a test can hold it to.
 */
export function shouldAskAboutPush(state: PushState): boolean {
  return state !== "granted" && state !== "unsupported";
}

/** How long "later" lasts. Long enough not to nag, short enough to return. */
export const PUSH_SNOOZE_DAYS = 7;

export function pushSnoozeUntil(now: number): number {
  return now + PUSH_SNOOZE_DAYS * 24 * 60 * 60 * 1000;
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
  subscription?: DeviceSubscription;
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

    const options: PushSubscriptionOptionsInit = {
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    };

    let sub: PushSubscription;
    try {
      sub = await reg.pushManager.subscribe(options);
    } catch (err) {
      // A subscription already exists on this device under a different
      // application key. Browsers will not re-key one in place — they
      // raise InvalidStateError — and this app generated its key pair
      // after some devices had already subscribed, so those devices are
      // stuck on a key nothing signs with any more. The old subscription
      // is worthless: drop it and make a current one.
      if ((err as Error)?.name !== "InvalidStateError") throw err;
      const stale = await reg.pushManager.getSubscription();
      await stale?.unsubscribe();
      sub = await reg.pushManager.subscribe(options);
    }

    const subscription = read(sub);
    if (!subscription) return { ok: false, error: "המנוי נוצר חלקית. נסו שוב." };

    return { ok: true, subscription };
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
