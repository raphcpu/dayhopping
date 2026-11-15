// Akkusparen beim Live-Tracking: Wer an einer Station eingecheckt ist, bewegt sich kaum.
// Dann reicht ein seltener, stromsparender Standort („sparen“). Unterwegs zwischen den
// Stationen wird häufig und genau geortet („unterwegs“), damit Weg und Ankunft stimmen.

export type TrackingMode = 'unterwegs' | 'sparen';

/** Offener Check-in laut Server (Mittelpunkt und Radius der Station) */
export type OpenCheckin = { station_id: string; lat: number; lng: number; radius_m: number } | null;

export type Fix = { latitude: number; longitude: number; accuracy: number | null };

/** Antwort von report_location_state */
export type ReportState = { active: number; checkin: OpenCheckin };

export const MODE_OPTIONS = {
  /** Browser: Mindestabstand zwischen zwei Meldungen */
  webTransitMs: 8_000,
  /** Browser: Abstand der Standortabfragen im Sparmodus */
  webSaverMs: 150_000,
  /** App: Intervalle (Android) und Mindestbewegung */
  appTransit: { timeInterval: 10_000, distanceInterval: 10 },
  appSaver: { timeInterval: 120_000, distanceInterval: 25 },
} as const;

function distanceM(a: { latitude: number; longitude: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const dLat = ((b.lat - a.latitude) * Math.PI) / 180;
  const dLng = ((b.lng - a.longitude) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Welcher Modus passt zum letzten Standort?
 * - Nicht eingecheckt → unterwegs.
 * - Eingecheckt und (soweit messbar) noch in der Station → sparen.
 * - Eingecheckt, aber der Standort liegt klar außerhalb → sofort unterwegs. Klar heißt:
 *   auch mit der Messungenauigkeit (max. 100 m angerechnet) außerhalb, oder bei guter
 *   Genauigkeit (≤ 50 m) schlicht außerhalb. Schwaches GPS in Innenräumen (große
 *   Ungenauigkeit) reißt einen deshalb nicht aus dem Sparmodus.
 */
export function nextMode(checkin: OpenCheckin, fix: Fix | null): TrackingMode {
  if (!checkin) return 'unterwegs';
  if (!fix) return 'sparen';
  const d = distanceM(fix, checkin);
  const acc = fix.accuracy ?? 100;
  if (d - Math.min(acc, 100) > checkin.radius_m) return 'unterwegs';
  if (acc <= 50 && d > checkin.radius_m) return 'unterwegs';
  return 'sparen';
}

// Aktuellen Modus für die Oberfläche bereitstellen (Hinweis auf der Karte)
let current: TrackingMode = 'unterwegs';
const listeners = new Set<(m: TrackingMode) => void>();

export function setTrackingMode(m: TrackingMode) {
  if (m === current) return;
  current = m;
  listeners.forEach((l) => l(m));
}

export const getTrackingMode = () => current;

export function onTrackingMode(l: (m: TrackingMode) => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
