// Web (iPhone-PWA): Ortung nur, solange die App offen ist. Das Display wird dabei
// wachgehalten (Wake Lock), damit das Teilen nicht nach kurzer Zeit abbricht.
import { supabase } from './supabase';
import { type Fix, MODE_OPTIONS, nextMode, type ReportState, setTrackingMode, type TrackingMode } from './trackingMode';

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

async function report(pos: GeolocationPosition): Promise<ReportState | null> {
  const { data, error } = await supabase.rpc('report_location_state', {
    p_lat: pos.coords.latitude,
    p_lng: pos.coords.longitude,
    p_accuracy: pos.coords.accuracy,
    p_heading: pos.coords.heading != null && pos.coords.heading >= 0 ? pos.coords.heading : null,
    p_speed: pos.coords.speed != null && pos.coords.speed >= 0 ? pos.coords.speed : null,
    p_recorded_at: new Date(pos.timestamp).toISOString(),
  });
  return error ? null : (data as ReportState);
}

const fixOf = (pos: GeolocationPosition): Fix => ({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy });

/**
 * Ortet, solange die App sichtbar ist, und hält das Display an.
 * Unterwegs: GPS-Dauerbeobachtung, Meldung höchstens alle 8 s.
 * Eingecheckt: GPS aus, nur alle 2,5 Minuten eine stromsparende Abfrage (WLAN/Funkzelle).
 * Liegt eine davon klar außerhalb der Station, geht es sofort zurück in den genauen Modus.
 */
export async function watchForeground(): Promise<() => void> {
  let stopped = false;
  let mode: TrackingMode = 'unterwegs';
  let watchId: number | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let last = 0;
  let failures = 0;

  const handle = async (pos: GeolocationPosition) => {
    granted = true;
    failures = 0;
    const state = await report(pos).catch(() => null);
    // Ohne Antwort (offline) nichts umschalten: lieber genau weiterorten
    if (!state || stopped) return;
    apply(nextMode(state.checkin, fixOf(pos)));
  };

  const startTransit = () => {
    if (watchId != null) return;
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (Date.now() - last < MODE_OPTIONS.webTransitMs) return;
        last = Date.now();
        handle(pos);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
  };
  const stopTransit = () => {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  };

  // Sparmodus: einzelne Abfragen. Erst stromsparend; klappt das zweimal nicht
  // (z. B. tief im Gebäude), einmal genau versuchen.
  const saverTick = () => {
    const precise = failures >= 2;
    navigator.geolocation.getCurrentPosition(
      (pos) => handle(pos),
      () => {
        failures++;
      },
      { enableHighAccuracy: precise, maximumAge: 60_000, timeout: precise ? 30_000 : 20_000 },
    );
  };
  const startSaver = () => {
    if (timer) return;
    timer = setInterval(saverTick, MODE_OPTIONS.webSaverMs);
  };
  const stopSaver = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  const apply = (m: TrackingMode) => {
    if (stopped || m === mode) return;
    mode = m;
    setTrackingMode(m);
    if (m === 'sparen') {
      stopTransit();
      startSaver();
    } else {
      stopSaver();
      last = 0;
      startTransit();
    }
  };

  // Start (auch nach Neustart der App mitten im Check-in): genau beginnen; die erste
  // Antwort des Servers sagt, ob man eingecheckt ist, und schaltet dann ggf. aufs Sparen.
  setTrackingMode('unterwegs');
  startTransit();

  // Display wachhalten; nach dem Zurückkehren in die App neu anfordern und sofort orten
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
    if (document.visibilityState !== 'visible') return;
    wake();
    // War das Handy gesperrt, kann man inzwischen woanders sein
    if (mode === 'sparen') saverTick();
  };
  wake();
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    stopped = true;
    stopTransit();
    stopSaver();
    setTrackingMode('unterwegs');
    document.removeEventListener('visibilitychange', onVisible);
    lock?.release().catch(() => {});
  };
}
