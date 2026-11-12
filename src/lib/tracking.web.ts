// Web (iPhone-PWA): Ortung nur, solange die App offen ist. Das Display wird dabei
// wachgehalten (Wake Lock), damit das Teilen nicht nach kurzer Zeit abbricht.
import { supabase } from './supabase';

export const LOCATION_TASK = 'dayhop-standort';

export type TrackingState = 'aus' | 'hintergrund' | 'vordergrund' | 'keine-berechtigung';

async function hasActiveSharingRound(): Promise<boolean | null> {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user.id;
  if (!uid) return false;
  const { data, error } = await supabase
    .from('round_members')
    .select('round_id, rounds!inner(status)')
    .eq('user_id', uid)
    .eq('sharing', true)
    .eq('rounds.status', 'aktiv')
    .limit(1);
  if (error) return null;
  return (data?.length ?? 0) > 0;
}

// Ältere Safari-Versionen kennen die Permissions-API für Standort nicht: erfolgreiche Ortung merken
let granted = false;

async function permission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (granted) return 'granted';
  try {
    const p = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    return (p?.state as 'granted' | 'denied' | 'prompt') ?? 'prompt';
  } catch {
    return 'prompt'; // ältere Browser: beim ersten Orten fragen
  }
}

export async function stopBackgroundTracking() {}

export async function syncTracking(): Promise<TrackingState> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'aus';
  const active = await hasActiveSharingRound().catch(() => null);
  if (active === false) return 'aus';
  const p = await permission();
  return p === 'granted' ? 'vordergrund' : 'keine-berechtigung';
}

export async function requestTrackingPermissions(): Promise<TrackingState> {
  await new Promise<void>((resolve) => {
    navigator.geolocation.getCurrentPosition(() => {
      granted = true;
      resolve();
    }, () => resolve(), { enableHighAccuracy: true, timeout: 15000 });
  });
  return syncTracking();
}

/** Ortet, solange die App sichtbar ist, und hält das Display an. */
export async function watchForeground(): Promise<() => void> {
  let last = 0;
  const id = navigator.geolocation.watchPosition(
    (pos) => {
      granted = true;
      if (Date.now() - last < 8000) return;
      last = Date.now();
      supabase.rpc('report_location', {
        p_lat: pos.coords.latitude,
        p_lng: pos.coords.longitude,
        p_accuracy: pos.coords.accuracy,
        p_heading: pos.coords.heading != null && pos.coords.heading >= 0 ? pos.coords.heading : null,
        p_speed: pos.coords.speed != null && pos.coords.speed >= 0 ? pos.coords.speed : null,
        p_recorded_at: new Date(pos.timestamp).toISOString(),
      }).then(() => {}, () => {});
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
  );

  // Display wachhalten; nach dem Zurückkehren in die App neu anfordern
  type Sentinel = { release: () => Promise<void> };
  let lock: Sentinel | null = null;
  const wake = async () => {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock;
      if (wl && document.visibilityState === 'visible') lock = await wl.request('screen');
    } catch {
      lock = null;
    }
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') wake();
  };
  wake();
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    navigator.geolocation.clearWatch(id);
    document.removeEventListener('visibilitychange', onVisible);
    lock?.release().catch(() => {});
  };
}
