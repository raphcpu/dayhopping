import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isLiveAt } from '@/lib/presence';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { requestTrackingPermissions, syncTracking, type TrackingState, watchForeground } from '@/lib/tracking';
import type { Checkin, Expense, LiveLocation, Media, Member, Message, Profile, Report, Round, Settlement, Station } from '@/lib/types';
import { useAuth } from './AuthProvider';

type RoundContext = {
  loading: boolean;
  /** Laden fehlgeschlagen (meist keine Verbindung) und noch keine Daten da */
  loadError: boolean;
  /** Eigene, gerade gesendete Nachricht sofort anzeigen (falls Echtzeit hängt) */
  addMessage: (m: Message) => void;
  /** true, wenn die Runde gelöscht wurde oder man kein Mitglied mehr ist */
  gone: boolean;
  round: Round | null;
  members: Member[];
  stations: Station[];
  locations: LiveLocation[];
  checkins: Checkin[];
  messages: Message[];
  expenses: Expense[];
  settlements: Settlement[];
  media: Media[];
  /** Offene und erledigte Meldungen; für Organisatoren alle, sonst nur die eigenen */
  reports: Report[];
  me: Member | null;
  isOrganizer: boolean;
  profileOf: (userId: string | null) => Profile;
  unread: number;
  markRead: () => void;
  /** sendet die Person gerade Standort (letzte 5 Minuten)? */
  isLive: (userId: string | null) => boolean;
  tracking: TrackingState;
  askTracking: () => Promise<TrackingState>;
  refreshTracking: () => Promise<void>;
  reload: () => Promise<void>;
};

const Ctx = createContext<RoundContext | null>(null);
const UNKNOWN: Profile = { id: '', display_name: 'Ehemaliges Mitglied', avatar_path: null, color: '#9A9186' };
const MESSAGE_LIMIT = 300;

type Change = { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: any; old: any };

export function RoundProvider({ roundId, children }: { roundId: string; children: ReactNode }) {
  const { userId, blocked } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [gone, setGone] = useState(false);
  const [round, setRound] = useState<Round | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [locations, setLocations] = useState<LiveLocation[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [allMessages, setMessages] = useState<Message[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [allMedia, setMedia] = useState<Media[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [lastRead, setLastRead] = useState<string>(new Date().toISOString());
  const [tracking, setTracking] = useState<TrackingState>('aus');

  const loaders = useMemo(() => {
    const q = (table: string) => supabase.from(table).select('*').eq('round_id', roundId);
    return {
      rounds: async () => {
        const { data, error } = await supabase.from('rounds').select('*').eq('id', roundId).maybeSingle();
        if (error) {
          setLoadError(true);
          return;
        }
        setLoadError(false);
        setRound(data as Round | null);
        setGone(!data);
      },
      round_members: async () => {
        const { data } = await supabase.from('round_members').select('*, profile:profiles(*)').eq('round_id', roundId).order('joined_at');
        if (data) setMembers(data as Member[]);
      },
      stations: async () => {
        const { data } = await q('stations').order('position');
        if (data) setStations(data as Station[]);
      },
      locations: async () => {
        const { data } = await q('locations');
        if (data) setLocations(data as LiveLocation[]);
      },
      checkins: async () => {
        const { data } = await q('checkins').order('arrived_at');
        if (data) setCheckins(data as Checkin[]);
      },
      messages: async () => {
        const { data } = await q('messages').order('created_at', { ascending: false }).limit(MESSAGE_LIMIT);
        if (data) setMessages(data as Message[]);
      },
      expenses: async () => {
        const { data } = await supabase.from('expenses').select('*, shares:expense_shares(*)').eq('round_id', roundId).order('created_at', { ascending: false });
        if (data) setExpenses(data as Expense[]);
      },
      settlements: async () => {
        const { data } = await q('settlements').order('created_at', { ascending: false });
        if (data) setSettlements(data as Settlement[]);
      },
      media: async () => {
        const { data } = await q('media').order('created_at', { ascending: false });
        if (data) setMedia(data as Media[]);
      },
      reports: async () => {
        const { data } = await q('reports').order('created_at', { ascending: false });
        if (data) setReports(data as Report[]);
      },
    };
  }, [roundId]);

  const reload = useCallback(async () => {
    await Promise.all(Object.values(loaders).map((load) => load()));
    setLoading(false);
  }, [loaders]);

  const refreshTracking = useCallback(() => syncTracking().then(setTracking), []);
  const askTracking = useCallback(async () => {
    const state = await requestTrackingPermissions();
    setTracking(state);
    return state;
  }, []);

  // Zuletzt geöffneten Hop merken: Beim nächsten App-Start geht es direkt dorthin
  useEffect(() => {
    if (userId) storage.setItem(`dayhop:letzter-hop:${userId}`, roundId);
  }, [roundId, userId]);

  // Erstes Laden, Echtzeit-Abo, Auffrischen beim Zurückkehren in die App
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lädt Daten vom Server; der Zustand wird erst nach der Antwort gesetzt
    reload();
    storage.getItem(`dayhop:gelesen:${roundId}`).then((v) => v && setLastRead(v));

    const timers: Record<string, ReturnType<typeof setTimeout>> = {};
    const refetch = (table: keyof typeof loaders) => {
      clearTimeout(timers[table]);
      timers[table] = setTimeout(() => loaders[table](), 150);
    };

    const channel = supabase.channel(`runde:${roundId}`);
    const listen = (table: string, filter: string, handler: (c: Change) => void) =>
      channel.on('postgres_changes' as any, { event: '*', schema: 'public', table, filter }, handler as any);
    const byRound = `round_id=eq.${roundId}`;

    // Echtzeit-Ereignisse, die während einer Verbindungsunterbrechung verpasst wurden, nachladen
    let subscribedOnce = false;
    listen('rounds', `id=eq.${roundId}`, (c) => {
      if (c.eventType === 'DELETE') setGone(true);
      else setRound(c.new as Round);
    });
    listen('round_members', byRound, () => {
      refetch('round_members');
      refetch('reports'); // nach einem Rollenwechsel sieht man mehr oder weniger
      refetch('rounds'); // erkennt, wenn man selbst entfernt wurde
    });
    listen('stations', byRound, () => refetch('stations'));
    listen('checkins', byRound, () => refetch('checkins'));
    listen('expenses', byRound, () => refetch('expenses'));
    listen('settlements', byRound, () => refetch('settlements'));
    listen('media', byRound, () => refetch('media'));
    listen('reports', byRound, () => refetch('reports'));
    // Positionen und Nachrichten kommen oft: direkt einarbeiten statt neu laden
    listen('locations', byRound, (c) => {
      // Lösch-Ereignisse kommen ungefiltert: nur die eigene Runde berücksichtigen
      if (c.eventType === 'DELETE' && c.old?.round_id && c.old.round_id !== roundId) return;
      setLocations((prev) => {
        const uid = (c.eventType === 'DELETE' ? c.old : c.new).user_id;
        const rest = prev.filter((l) => l.user_id !== uid);
        return c.eventType === 'DELETE' ? rest : [...rest, c.new as LiveLocation];
      });
    });
    listen('messages', byRound, (c) => {
      setMessages((prev) => {
        if (c.eventType === 'DELETE') return prev.filter((m) => m.id !== c.old.id);
        if (prev.some((m) => m.id === c.new.id)) return prev;
        return [c.new as Message, ...prev].slice(0, MESSAGE_LIMIT);
      });
    });
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (subscribedOnce) reload();
        subscribedOnce = true;
      }
    });

    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        reload();
        refreshTracking();
      }
    });
    return () => {
      Object.values(timers).forEach(clearTimeout);
      supabase.removeChannel(channel);
      app.remove();
    };
  }, [roundId, reload, loaders, refreshTracking]);

  const me = useMemo(() => members.find((m) => m.user_id === userId) ?? null, [members, userId]);

  // Blockierte Personen ausblenden. Durchsagen und Systemzeilen bleiben sichtbar.
  const messages = useMemo(
    () => (blocked.size ? allMessages.filter((m) => m.kind !== 'chat' || !m.user_id || !blocked.has(m.user_id)) : allMessages),
    [allMessages, blocked],
  );
  const media = useMemo(() => (blocked.size ? allMedia.filter((m) => !blocked.has(m.user_id)) : allMedia), [allMedia, blocked]);

  // Ortung an den Stand der Runde koppeln
  const status = round?.status;
  const sharing = me?.sharing;
  useEffect(() => {
    if (status) syncTracking().then(setTracking);
  }, [status, sharing]);

  // Ohne "Immer"-Berechtigung: wenigstens orten, solange die App offen ist
  useEffect(() => {
    if (tracking !== 'vordergrund') return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    watchForeground().then((s) => (cancelled ? s() : (stop = s))).catch(() => {});
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [tracking]);

  // Live-Status regelmäßig neu bewerten, auch ohne neue Standortmeldungen
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const liveSet = useMemo(() => new Set(locations.filter((l) => isLiveAt(l.recorded_at, now)).map((l) => l.user_id)), [locations, now]);
  const isLive = useCallback((id: string | null) => !!id && liveSet.has(id), [liveSet]);

  const profiles = useMemo(() => new Map(members.map((m) => [m.user_id, m.profile])), [members]);
  const profileOf = useCallback((id: string | null) => (id && profiles.get(id)) || UNKNOWN, [profiles]);

  const unread = useMemo(
    () => messages.filter((m) => m.kind !== 'system' && m.user_id !== userId && m.created_at > lastRead).length,
    [messages, lastRead, userId],
  );
  const newest = useRef<string | null>(null);
  useEffect(() => {
    newest.current = messages[0]?.created_at ?? null;
  }, [messages]);
  const markRead = useCallback(() => {
    // Serverzeit der neuesten Nachricht verwenden, falls die Geräteuhr falsch geht
    const now = new Date().toISOString();
    const stamp = newest.current && newest.current > now ? newest.current : now;
    setLastRead(stamp);
    storage.setItem(`dayhop:gelesen:${roundId}`, stamp);
  }, [roundId]);

  const addMessage = useCallback((m: Message) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev].slice(0, MESSAGE_LIMIT)));
  }, []);

  const value: RoundContext = {
    loading, loadError, addMessage, gone, round, members, stations, locations, checkins, messages, expenses, settlements, media, reports,
    me, isOrganizer: me?.role === 'organizer', profileOf, unread, markRead, isLive, tracking, askTracking, refreshTracking, reload,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRound(): RoundContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRound außerhalb von RoundProvider');
  return v;
}
