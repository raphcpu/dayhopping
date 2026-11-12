// Live-Status: Wer in den letzten 5 Minuten einen Standort gemeldet hat, gilt als live.
export const LIVE_MS = 5 * 60_000;
export const LIVE_GREEN = '#22C55E';
export const OFFLINE_GREY = '#A3A9B6';

export function isLiveAt(recordedAt: string | undefined | null, now: number): boolean {
  return !!recordedAt && now - new Date(recordedAt).getTime() <= LIVE_MS;
}
