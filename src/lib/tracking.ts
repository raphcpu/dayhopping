import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { supabase } from './supabase';

export const LOCATION_TASK = 'dayhop-standort';

export type TrackingState =
  | 'aus' // kein laufender Hop, in dem der Standort geteilt wird
  | 'hintergrund' // volle Ortung, auch bei gesperrtem Gerät
  | 'vordergrund' // nur "Beim Verwenden" erlaubt: Ortung nur bei geöffneter App
  | 'keine-berechtigung';

async function report(l: Location.LocationObject): Promise<number | null> {
  const { data, error } = await supabase.rpc('report_location', {
    p_lat: l.coords.latitude,
    p_lng: l.coords.longitude,
    p_accuracy: l.coords.accuracy,
    p_heading: l.coords.heading != null && l.coords.heading >= 0 ? l.coords.heading : null,
    p_speed: l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed : null,
    p_recorded_at: new Date(l.timestamp).toISOString(),
  });
  return error ? null : (data as number);
}

// Läuft auch, wenn die App minimiert oder das Gerät gesperrt ist. Muss beim
// App-Start auf oberster Ebene definiert sein (Import in app/_layout.tsx).
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) return stopBackgroundTracking();
  const active = await report(data.locations[data.locations.length - 1]);
  // Der Server meldet 0, sobald kein Hop mehr läuft: Ortung beendet sich selbst.
  if (active === 0) await stopBackgroundTracking();
});

export async function stopBackgroundTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {});
  }
}

async function startBackgroundTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) return;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 15000, // Android: frühestens alle 15 s
    distanceInterval: 15, // erst nach 15 m Bewegung, spart Akku im Stand
    deferredUpdatesInterval: 15000,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.Fitness,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'DayHop teilt deinen Standort',
      notificationBody: 'Deine Gruppe sieht, wo du bist. Pausieren kannst du das in der App.',
      notificationColor: '#5B3DF5',
    },
  });
}

async function hasActiveSharingRound(): Promise<boolean> {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user.id;
  if (!uid) return false;
  const { data } = await supabase
    .from('round_members')
    .select('round_id, rounds!inner(status)')
    .eq('user_id', uid)
    .eq('sharing', true)
    .eq('rounds.status', 'aktiv')
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/** Gleicht die Ortung mit dem Stand der Hops ab. Fragt selbst keine Berechtigungen an. */
export async function syncTracking(): Promise<TrackingState> {
  if (!(await hasActiveSharingRound())) {
    await stopBackgroundTracking();
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

/** Ersatz, wenn nur "Beim Verwenden" erlaubt ist: Ortung, solange die App offen ist. */
export async function watchForeground(): Promise<() => void> {
  let last = 0;
  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 10 },
    (l) => {
      if (Date.now() - last < 8000) return;
      last = Date.now();
      report(l);
    },
  );
  return () => sub.remove();
}
