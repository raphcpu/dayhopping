// Fängt JavaScript-Fehler ab, schickt sie an Supabase (Tabelle client_errors) und
// lässt die Oberfläche einen Fehlerbildschirm zeigen, statt die App zu beenden.
// Wird in index.ts als Allererstes geladen und nutzt bewusst nur fetch, damit es
// auch funktioniert, wenn andere Module beim Laden scheitern.
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export type CrashInfo = { message: string; stack: string };

const listeners = new Set<(c: CrashInfo) => void>();
let lastFatal: CrashInfo | null = null;

function describe(error: unknown): CrashInfo {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack ?? '' };
  return { message: String(error), stack: '' };
}

export function reportError(error: unknown, fatal: boolean, where?: string) {
  const info = describe(error);
  if (!URL || !KEY) return info;
  fetch(`${URL}/rest/v1/client_errors`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      fatal,
      message: info.message.slice(0, 2000),
      stack: info.stack.slice(0, 8000),
      context: {
        where: where ?? null,
        os: Platform.OS,
        osVersion: String(Platform.Version),
        app: Constants.expoConfig?.version ?? null,
        model: (Platform.constants as { Model?: string; Manufacturer?: string })?.Model ?? null,
        manufacturer: (Platform.constants as { Manufacturer?: string })?.Manufacturer ?? null,
      },
    }),
  }).catch(() => {});
  return info;
}

/** Meldet sich für schwere Fehler an. Ruft sofort auf, wenn schon einer passiert ist. */
export function onFatal(listener: (c: CrashInfo) => void): () => void {
  listeners.add(listener);
  if (lastFatal) listener(lastFatal);
  return () => listeners.delete(listener);
}

type Handler = (error: unknown, isFatal?: boolean) => void;
const utils = (globalThis as { ErrorUtils?: { getGlobalHandler: () => Handler; setGlobalHandler: (h: Handler) => void } }).ErrorUtils;
const previous = utils?.getGlobalHandler();

utils?.setGlobalHandler((error, isFatal) => {
  const info = reportError(error, !!isFatal, 'global');
  if (!isFatal) return previous?.(error, isFatal);
  lastFatal = info;
  if (listeners.size > 0) {
    listeners.forEach((l) => l(info));
    return; // Oberfläche zeigt den Fehler, App bleibt offen
  }
  // Noch keine Oberfläche da: dem Bericht kurz Zeit zum Senden geben
  setTimeout(() => previous?.(error, isFatal), 2500);
});
