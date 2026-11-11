import type { Checkin, Member, Station } from './types';

export type StationStats = {
  station: Station;
  present: string[]; // user_ids, die gerade da sind
  visitors: string[]; // alle, die schon da waren
  avgStayMs: number | null;
};

export type MemberStats = {
  userId: string;
  visited: number;
  currentStationId: string | null;
  totalStayMs: number;
};

const stay = (c: Checkin, now: number) => (c.left_at ? new Date(c.left_at).getTime() : now) - new Date(c.arrived_at).getTime();

export function stationStats(stations: Station[], checkins: Checkin[], now = Date.now()): StationStats[] {
  return stations.map((station) => {
    const here = checkins.filter((c) => c.station_id === station.id);
    const done = here.filter((c) => c.left_at);
    return {
      station,
      present: here.filter((c) => !c.left_at).map((c) => c.user_id),
      visitors: [...new Set(here.map((c) => c.user_id))],
      avgStayMs: done.length ? done.reduce((s, c) => s + stay(c, now), 0) / done.length : null,
    };
  });
}

export function memberStats(members: Member[], checkins: Checkin[], now = Date.now()): MemberStats[] {
  return members.map((m) => {
    const mine = checkins.filter((c) => c.user_id === m.user_id);
    return {
      userId: m.user_id,
      visited: new Set(mine.map((c) => c.station_id)).size,
      currentStationId: mine.find((c) => !c.left_at)?.station_id ?? null,
      totalStayMs: mine.reduce((s, c) => s + stay(c, now), 0),
    };
  });
}
