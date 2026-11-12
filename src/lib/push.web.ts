// Web-Push für die iPhone-PWA (ab iOS 16.4, nur wenn DayHop zum Home-Bildschirm hinzugefügt wurde).
// Der Service Worker (public/sw.js) zeigt die Mitteilung an und öffnet beim Tippen den passenden Tab.
import { supabase } from './supabase';

const BASE = process.env.EXPO_PUBLIC_BASE_PATH || '/';
const VAPID = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY || '';

export type PushData = { roundId?: string; type?: 'chat' | 'announcement' | 'expense' | 'status' | 'report' };
export type WebPushState = 'aktiv' | 'moeglich' | 'abgelehnt' | 'installieren' | 'nicht-unterstuetzt';

let currentToken: string | null = null;

const supported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID;

const standalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);

const isIOS = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration() {
  return navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE });
}

async function subscribe(): Promise<boolean> {
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }));
  const token = JSON.stringify(sub.toJSON());
  currentToken = token;
  const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: 'web' });
  return !error;
}

/** Wie steht es um Mitteilungen in diesem Browser? */
export function webPushState(): WebPushState | null {
  if (isIOS() && !standalone()) return 'installieren';
  if (!supported()) return 'nicht-unterstuetzt';
  if (Notification.permission === 'granted') return 'aktiv';
  if (Notification.permission === 'denied') return 'abgelehnt';
  return 'moeglich';
}

/** Muss direkt durch Antippen ausgelöst werden (Safari fragt sonst nicht). */
export async function enableWebPush(): Promise<WebPushState | null> {
  if (!supported()) return webPushState();
  const perm = await Notification.requestPermission();
  if (perm === 'granted') await subscribe().catch(() => false);
  return webPushState();
}

/** Beim Anmelden: still erneuern, falls Mitteilungen schon erlaubt sind. Fragt nie selbst nach. */
export async function registerForPush(): Promise<boolean> {
  if (!supported()) return false;
  // Service Worker immer registrieren: macht DayHop installierbar und offline startfähig
  await registration().catch(() => null);
  if (Notification.permission !== 'granted') return false;
  return subscribe().catch(() => false);
}

export async function unregisterPush() {
  if (currentToken) await supabase.from('push_tokens').delete().eq('token', currentToken);
  currentToken = null;
}

/** Im Browser öffnet der Service Worker die Seite direkt; hier ist nichts zu tun. */
export function onPushTap(_handler: (data: PushData) => void): () => void {
  return () => {};
}
