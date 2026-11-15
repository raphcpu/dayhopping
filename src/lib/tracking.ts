import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { storage } from './storage';
import { supabase } from './supabase';
import { type Fix, MODE_OPTIONS, nextMode, type ReportState, setTrackingMode, type TrackingMode } from './trackingMode';

export const LOCATION_TASK = 'dayhop-standort';

export type TrackingState =
  | 'aus' // kein laufender Hop, in dem der Standort geteilt wird
  | 'hintergrund' // volle Ortung, auch bei gesperrtem Gerät
  | 'vordergrund' // nur "Beim Verwenden" erlaubt: Ortung nur bei geöffneter App
  | 'keine-berechtigung';

async function report(l: Location.LocationObject): Promise<ReportState | null> {
  const { data, error } = await supabase.rpc('report_location_state', {
    p_lat: l.coords.latitude,
    p_lng: l.coords.longitude,
    p_accuracy: l.coords.accuracy,
    p_heading: l.coords.heading != null && l.coords.heading >= 0 ? l.coords.heading : null,
    p_speed: l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed : null,
    p_recorded_at: new Date(l.timestamp).toISOString(),
  });
  return error ? null : (data as ReportState);
}

const fixOf = (l: Location.LocationObject): Fix => ({ latitude: l.coords.latitude, longitude: l.coords.longitude, accuracy: l.coords.accuracy });

// Der laufende Modus der Hintergrund-Ortung wird gespeichert: Die Aufgabe läuft nach
// einem App-Neustart mit ihren alten Einstellungen weiter, der JS-Zustand nicht.
const MODE_KEY = 'dayhop:ortung-modus';

function optionsFor(mode: TrackingMode): Location.LocationTaskOptions {
  const saver = mode === 'sparen';
  return {
    // Eingecheckt: WLAN/Funkzelle statt Dauer-GPS, nur alle 2 Minuten bzw. nach 25 m
    accuracy: saver ? Location.Accuracy.Balanced : Location.Accuracy.High,
    ...(saver ? MODE_OPTIONS.appSaver : MODE_OPTIONS.appTransit),
    // Android: im Sparmodus auch ohne Bewegung alle 2 Minuten melden (sonst gilt man als offline)
    ...(saver && Platform.OS === 'android' ? { distanceInterval: 0 } : null),
    deferredUpdatesInterval: saver ? MODE_OPTIONS.appSaver.timeInterval : MODE_OPTIONS.appTransit.timeInterval,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.Fitness,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'DayHop teilt deinen Standort',
      notificationBody: saver
        ? 'Du bist eingecheckt – Akkusparmodus. Sobald du weitergehst, wird wieder genau geortet.'
        : 'Deine Gruppe sieht, wo du bist. Pausieren kannst du das in der App.',
      notificationColor: '#5B3DF5',
    },
  };
}

/**
 * Hintergrund-Ortung auf den Modus umstellen. Erneutes Starten derselben Aufgabe
 * ändert nur deren Einstellungen (der Vordergrunddienst läuft weiter), das geht
 * deshalb auch aus dem Hintergrund heraus.
 */
async function applyBackgroundMode(mode: TrackingMode) {
  const stored = (await storage.getItem(MODE_KEY)) as TrackingMode | null;
  setTrackingMode(mode);
  if (stored === mode) return;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, optionsFor(mode));
  await storage.setItem(MODE_KEY, mode);
}

// Läuft auch, wenn die App minimiert oder das Gerät gesperrt ist. Muss beim
// App-Start auf oberster Ebene definiert sein (Import in app/_layout.tsx).
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) return stopBackgroundTracking();
  const latest = data.locations[data.locations.length - 1];
  const state = await report(latest);
  if (!state) return; // offline: Modus beibehalten
  // Der Server meldet 0, sobald kein Hop mehr läuft: Ortung beendet sich selbst.
  if (state.active === 0) return stopBackgroundTracking();
  await applyBackgroundMode(nextMode(state.checkin, fixOf(latest))).catch(() => {});
});

export async function stopBackgroundTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {});
  }
  await storage.removeItem(MODE_KEY).catch(() => {});
  setTrackingMode('unterwegs');
}

async function startBackgroundTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    // Läuft schon (z. B. nach App-Neustart): Modus für die Anzeige übernehmen
    setTrackingMode(((await storage.getItem(MODE_KEY)) as TrackingMode | null) ?? 'unterwegs');
    return;
  }
  // Neu starten immer genau; die erste Meldung schaltet bei Bedarf aufs Sparen um
  await Location.startLocationUpdatesAsync(LOCATION_TASK, optionsFor('unterwegs'));
  await storage.setItem(MODE_KEY, 'unterwegs');
  setTrackingMode('unterwegs');
}

/** null = unbekannt (z. B. keine Verbindung): dann nichts an der laufenden Ortung ändern */
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

// Mehrere Stellen fragen gleichzeitig an (Start, Rückkehr in die App, Einstellungen):
// laufende Abgleiche zusammenfassen, statt die Ortung parallel zu starten.
let inFlight: Promise<TrackingState> | null = null;

/** Gleicht die Ortung mit dem Stand der Hops ab. Fragt selbst keine Berechtigungen an. */
export function syncTracking(): Promise<TrackingState> {
  inFlight ??= doSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doSync(): Promise<TrackingState> {
  const active = await hasActiveSharingRound().catch(() => null);
  if (active === false) {
    await stopBackgroundTracking();
    return 'aus';
  }
  if (active === null && !(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false))) {
    // Offline und noch keine Ortung aktiv: nichts erzwingen, später erneut prüfen
    return 'aus';
  }
  const fg = await Location.getForegroundPermissionsAsync();
  if (!fg.granted) return 'keine-berechtigung';
  const bg = await Location.getBackgroundPermissionsAsync();
  if (!bg.granted) return 'vordergrund';
  try {
    await startBackgroundTracking();
    return 'hintergrund';
  } catch {
    return 'vordergrund';
  }
}

/** Fragt erst "Beim Verwenden", dann "Immer" an (in dieser Reihenfolge verlangen es iOS und Android). */
export async function requestTrackingPermissions(): Promise<TrackingState> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.granted) await Location.requestBackgroundPermissionsAsync().catch(() => {});
  return syncTracking();
}

/** Ersatz, wenn nur "Beim Verwenden" erlaubt ist: Ortung, solange die App offen ist. Mit Akkusparmodus. */
export async function watchForeground(): Promise<() => void> {
  let stopped = false;
  let mode: TrackingMode = 'unterwegs';
  let sub: Location.LocationSubscription | null = null;
  let last = 0;

  const subscribe = async (m: TrackingMode) => {
    sub?.remove();
    const saver = m === 'sparen';
    const opts = saver ? MODE_OPTIONS.appSaver : MODE_OPTIONS.appTransit;
    const next = await Location.watchPositionAsync(
      { accuracy: saver ? Location.Accuracy.Balanced : Location.Accuracy.High, ...opts, ...(saver && Platform.OS === 'android' ? { distanceInterval: 0 } : null) },
      async (l) => {
        // Unterwegs höchstens alle 8 s melden, im Sparmodus höchstens alle 2 Minuten
        const gap = saver ? MODE_OPTIONS.appSaver.timeInterval - 5000 : 8000;
        if (Date.now() - last < gap) return;
        last = Date.now();
        const state = await report(l).catch(() => null);
        if (!state || stopped) return;
        const want = nextMode(state.checkin, fixOf(l));
        if (want !== mode) {
          mode = want;
          setTrackingMode(want);
          last = 0;
          subscribe(want).catch(() => {});
        }
      },
    );
    if (stopped) next.remove();
    else sub = next;
  };

  setTrackingMode('unterwegs');
  await subscribe('unterwegs');
  return () => {
    stopped = true;
    sub?.remove();
    setTrackingMode('unterwegs');
  };
}
