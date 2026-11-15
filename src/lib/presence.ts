// Live-Status: Wer in den letzten 5 Minuten einen Standort gemeldet hat, gilt als live.
export const LIVE_MS = 5 * 60_000;
export const LIVE_GREEN = '#22C55E';
export const OFFLINE_GREY = '#A3A9B6';

export function isLiveAt(recordedAt: string | undefined | null, now: number): boolean {
  return !!recordedAt && now - new Date(recordedAt).getTime() <= LIVE_MS;
}

/** Eingecheckte im Akkusparmodus melden seltener (iPhone: nur bei Bewegung) – sie bleiben länger live */
export const LIVE_CHECKED_IN_MS = 15 * 60_000;

export function isLiveCheckedIn(recordedAt: string | undefined | null, now: number): boolean {
  return !!recordedAt && now - new Date(recordedAt).getTime() <= LIVE_CHECKED_IN_MS;
}
