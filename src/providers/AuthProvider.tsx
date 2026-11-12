import type { Session } from '@supabase/supabase-js';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { registerForPush, unregisterPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { stopBackgroundTracking, syncTracking } from '@/lib/tracking';
import type { Profile } from '@/lib/types';

type AuthContext = {
  loading: boolean;
  session: Session | null;
  userId: string | null;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<void>;
  /** Gibt true zurück, wenn erst noch die E-Mail bestätigt werden muss. */
  signUp: (name: string, email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  saveProfile: (patch: Partial<Pick<Profile, 'display_name' | 'avatar_path' | 'color'>>) => Promise<void>;
  /** IDs der Personen, die man blockiert hat */
  blocked: ReadonlySet<string>;
  block: (userId: string) => Promise<void>;
  unblock: (userId: string) => Promise<void>;
  /** Löscht das Konto samt eigenen Dateien endgültig. */
  deleteAccount: () => Promise<void>;
};

const Ctx = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setProfile] = useState<Profile | null>(null);
  const [blocks, setBlocks] = useState<{ owner: string; ids: string[] }>({ owner: '', ids: [] });
  const userId = session?.user.id ?? null;
  // Nach einem Kontowechsel nie das Profil der vorherigen Person zeigen
  const profile = loaded && loaded.id === userId ? loaded : null;

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null)) // z. B. beschädigte Sitzung: zur Anmeldung statt ewig Startbildschirm
      .finally(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle().then(({ data }) => setProfile(data as Profile | null));
    supabase.from('blocks').select('blocked_id').eq('blocker_id', userId)
      .then(({ data }) => setBlocks({ owner: userId, ids: (data ?? []).map((b) => b.blocked_id as string) }));
    registerForPush();
    syncTracking();
  }, [userId]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim() } },
    });
    if (error) throw error;
    return !data.session;
  }, []);

  const signOut = useCallback(async () => {
    await stopBackgroundTracking();
    await unregisterPush().catch(() => {});
    await supabase.auth.signOut();
  }, []);

  const saveProfile = useCallback<AuthContext['saveProfile']>(
    async (patch) => {
      if (!userId) return;
      const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select().single();
      if (error) throw error;
      setProfile(data as Profile);
    },
    [userId],
  );

  const blocked = useMemo(() => new Set(blocks.owner === userId ? blocks.ids : []), [blocks, userId]);

  const block = useCallback(async (id: string) => {
    if (!userId || id === userId) return;
    const { error } = await supabase.from('blocks').upsert({ blocker_id: userId, blocked_id: id });
    if (error) throw error;
    setBlocks((b) => ({ owner: userId, ids: [...new Set([...(b.owner === userId ? b.ids : []), id])] }));
  }, [userId]);

  const unblock = useCallback(async (id: string) => {
    if (!userId) return;
    const { error } = await supabase.from('blocks').delete().eq('blocker_id', userId).eq('blocked_id', id);
    if (error) throw error;
    setBlocks((b) => ({ owner: userId, ids: b.ids.filter((x) => x !== id) }));
  }, [userId]);

  const deleteAccount = useCallback(async () => {
    if (!userId) return;
    // Eigene Dateien zuerst: Die Datenbank kann den Dateispeicher nicht selbst aufräumen.
    const { data: media, error: mediaError } = await supabase.from('media').select('storage_path, thumb_path').eq('user_id', userId);
    if (mediaError) throw mediaError;
    const paths = (media ?? []).flatMap((m) => [m.storage_path as string, ...(m.thumb_path ? [m.thumb_path as string] : [])]);
    for (let i = 0; i < paths.length; i += 100) await supabase.storage.from('media').remove(paths.slice(i, i + 100));
    const { data: avatars } = await supabase.storage.from('avatars').list(userId);
    if (avatars?.length) await supabase.storage.from('avatars').remove(avatars.map((f) => `${userId}/${f.name}`));

    await stopBackgroundTracking();
    const { error } = await supabase.rpc('delete_account');
    if (error) throw error;
    // Das Konto gibt es serverseitig nicht mehr: nur noch lokal abmelden
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }, [userId]);

  const value = useMemo(
    () => ({ loading, session, userId, profile, signIn, signUp, signOut, saveProfile, blocked, block, unblock, deleteAccount }),
    [loading, session, userId, profile, signIn, signUp, signOut, saveProfile, blocked, block, unblock, deleteAccount],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth außerhalb von AuthProvider');
  return v;
}
