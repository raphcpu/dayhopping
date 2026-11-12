import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DateField } from '@/components/DateField';
import { Avatar, Body, Button, Card, EmptyState, Field, Heading, Sheet } from '@/components/ui';
import { WaveText } from '@/components/WaveText';
import { errorText, formatDay, toDay } from '@/lib/format';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { fonts, space, useColors } from '@/lib/theme';
import type { Round } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

type Row = Round & { memberCount: number; role: string };

// Nur beim ersten Anzeigen nach dem App-Start direkt in einen Hop springen,
// nicht wenn man bewusst zur Übersicht zurückkehrt.
let autoOpenDone = false;

export default function Home() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, userId, profile } = useAuth();
  const [rounds, setRounds] = useState<Row[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<'neu' | 'code' | null>(null);
  const [name, setName] = useState('');
  const [day, setDay] = useState<Date>(new Date());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('round_members')
      .select('role, round:rounds(*, round_members(count))')
      .eq('user_id', userId);
    const rows = ((data ?? []) as any[])
      .filter((r) => r.round)
      .map((r) => ({ ...r.round, role: r.role, memberCount: r.round.round_members?.[0]?.count ?? 1 }) as Row);
    // Laufende zuerst, dann geplante (nächste zuerst), dann vergangene
    const rank = { aktiv: 0, geplant: 1, beendet: 2 } as const;
    rows.sort((a, b) => rank[a.status] - rank[b.status] || (a.status === 'beendet' ? b.day.localeCompare(a.day) : a.day.localeCompare(b.day)));
    setRounds(rows);

    if (!autoOpenDone) {
      autoOpenDone = true;
      // Laufender Hop zuerst, sonst der zuletzt geöffnete (sofern nicht beendet)
      const last = await storage.getItem(`dayhop:letzter-hop:${userId}`);
      const target = rows.find((r) => r.status === 'aktiv') ?? rows.find((r) => r.id === last && r.status !== 'beendet');
      if (target) router.push(`/round/${target.id}`);
    }
  }, [userId, router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!session) return <Redirect href="/login" />;

  const open = (s: 'neu' | 'code') => {
    setError(null);
    setSheet(s);
  };

  const create = async () => {
    if (name.trim().length < 2) return setError('Gib deinem Hop einen Namen.');
    setBusy(true);
    const { data, error } = await supabase.rpc('create_round', { p_name: name, p_day: toDay(day) });
    setBusy(false);
    if (error) return setError(errorText(error));
    setSheet(null);
    setName('');
    router.push(`/round/${data}/dashboard`);
  };

  const join = async () => {
    if (code.trim().length !== 6) return setError('Der Code hat 6 Zeichen.');
    setBusy(true);
    const { data, error } = await supabase.rpc('join_round', { p_code: code });
    setBusy(false);
    if (error) return setError(errorText(error));
    setSheet(null);
    setCode('');
    router.push(`/round/${data}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: insets.top + space.l, paddingHorizontal: space.xl, paddingBottom: space.m, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Body muted>Hallo {profile?.display_name ?? ''}</Body>
          <WaveText text="Deine Hops" style={{ fontFamily: fonts.display, fontSize: 32, color: c.ink, letterSpacing: -0.5 }} />
        </View>
        <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Profil" hitSlop={8}>
          {profile ? <Avatar profile={profile} size={46} /> : <Ionicons name="person-circle" size={46} color={c.muted} />}
        </Pressable>
      </View>

      <FlatList
        data={rounds ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: insets.bottom + 110, gap: space.m, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accent} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={rounds ? (
          <EmptyState icon="footsteps" title="Noch kein Hop" text="Plane einen Tag mit mehreren Stationen oder tritt mit einem Einladungscode einem Hop bei." />
        ) : undefined}
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/round/${item.id}`)} >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.m }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Heading size={21}>{item.name}</Heading>
                <Body muted small>{formatDay(item.day)}</Body>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.l, marginTop: space.m }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="people" size={16} color={c.muted} />
                <Body muted small>{item.memberCount} {item.memberCount === 1 ? 'Person' : 'Personen'}</Body>
              </View>
              {item.role === 'organizer' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="star" size={15} color={c.muted} />
                  <Body muted small>Du organisierst</Body>
                </View>
              )}
            </View>
          </Card>
        )}
      />

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.l, paddingTop: space.m, paddingBottom: insets.bottom + space.m, flexDirection: 'row', gap: space.m, backgroundColor: c.bg }}>
        <Button title="Code eingeben" variant="soft" icon="keypad" onPress={() => open('code')} style={{ flex: 1 }} />
        <Button title="Neuer Hop" icon="add" onPress={() => open('neu')} style={{ flex: 1 }} />
      </View>

      <Sheet visible={sheet === 'neu'} onClose={() => setSheet(null)} title="Neuer Hop">
        <Field label="Name" value={name} onChangeText={setName} placeholder="z. B. Sommerhop Schanze" maxLength={60} autoFocus error={error} />
        <DateField label="Tag" mode="date" value={day} onChange={(d) => d && setDay(d)} />
        <Body muted small>Du wirst Organisator und kannst danach Stationen anlegen und Leute einladen.</Body>
        <Button title="Hop anlegen" onPress={create} loading={busy} />
      </Sheet>

      <Sheet visible={sheet === 'code'} onClose={() => setSheet(null)} title="Hop beitreten">
        <Field label="Einladungscode" value={code} onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABC234"
          autoCapitalize="characters" autoCorrect={false} maxLength={6} autoFocus error={error}
          style={{ fontSize: 28, letterSpacing: 6, textAlign: 'center', fontWeight: '700' }} />
        <Body muted small>Den Code bekommst du von der Person, die den Hop organisiert.</Body>
        <Button title="Beitreten" onPress={join} loading={busy} />
      </Sheet>
    </View>
  );
}
