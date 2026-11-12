import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, usePreventRemove, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from '@/lib/keyboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Body, Button, Card, Chip, Divider, Field, SectionLabel, Segmented } from '@/components/ui';
import { showAlert } from '@/lib/alert';
import { errorText } from '@/lib/format';
import { centsToInput, formatEuro, parseEuro, splitByWeights, splitEqually } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { fonts, radius, space, useColors } from '@/lib/theme';
import type { SplitMode } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useRound } from '@/providers/RoundProvider';

export default function ExpenseScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const { expenseId } = useLocalSearchParams<{ expenseId?: string }>();
  const { userId } = useAuth();
  const { round, members, stations, checkins, expenses, isOrganizer } = useRound();
  const existing = useMemo(() => expenses.find((e) => e.id === expenseId) ?? null, [expenses, expenseId]);
  // Ausgabe wurde inzwischen gelöscht: nicht versehentlich als neue speichern
  const missing = !!expenseId && !existing;
  // Beteiligte, die den Hop verlassen haben: deren Anteile würden beim Speichern verloren gehen
  const formerParticipants = useMemo(
    () => (existing ? existing.shares.filter((s) => !members.some((m) => m.user_id === s.user_id)).length : 0),
    [existing, members],
  );
  const canEdit = !missing && formerParticipants === 0 && (!existing || existing.created_by === userId || existing.payer_id === userId || isOrganizer);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [amountText, setAmountText] = useState(existing ? centsToInput(existing.amount_cents) : '');
  const [payer, setPayer] = useState(existing?.payer_id ?? userId ?? '');
  const [stationId, setStationId] = useState<string | null>(
    existing ? existing.station_id : (checkins.find((ch) => ch.user_id === userId && !ch.left_at)?.station_id ?? null),
  );
  const [mode, setMode] = useState<SplitMode>(existing?.split_mode ?? 'gleich');
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(members.map((m) => [m.user_id, existing ? existing.shares.some((s) => s.user_id === m.user_id) : true])),
  );
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(members.map((m) => [m.user_id, existing?.shares.find((s) => s.user_id === m.user_id)?.weight ?? 1])),
  );
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries((existing?.shares ?? []).map((s) => [s.user_id, centsToInput(s.share_cents)])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Ungespeicherte Eingaben nicht stillschweigend verwerfen (Zurück, Wischgeste)
  const dirty = !saved && canEdit && (title !== (existing?.title ?? '') || amountText !== (existing ? centsToInput(existing.amount_cents) : ''));
  usePreventRemove(dirty, ({ data }) => {
    showAlert('Änderungen verwerfen?', 'Die Ausgabe ist noch nicht gespeichert.', [
      { text: 'Weiter bearbeiten', style: 'cancel' },
      { text: 'Verwerfen', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  // Wer war an einer Station eingecheckt (jemals bzw. gerade)?
  const attendees = useMemo(() => {
    const ever = new Map<string, Set<string>>();
    const now = new Map<string, Set<string>>();
    for (const ch of checkins) {
      if (!ever.has(ch.station_id)) ever.set(ch.station_id, new Set());
      ever.get(ch.station_id)!.add(ch.user_id);
      if (!ch.left_at) {
        if (!now.has(ch.station_id)) now.set(ch.station_id, new Set());
        now.get(ch.station_id)!.add(ch.user_id);
      }
    }
    return { ever, now };
  }, [checkins]);
  const memberIds = members.map((m) => m.user_id);
  const selectOnly = (ids: Set<string> | string[]) => {
    const set = new Set(ids);
    setSelected(Object.fromEntries(memberIds.map((id) => [id, set.has(id)])));
  };
  const chooseStation = (id: string | null) => {
    setStationId(id);
    // Neue Ausgabe an einer Station: automatisch auf alle aufteilen, die dort eingecheckt waren
    const there = id ? attendees.ever.get(id) : undefined;
    if (!existing && there && there.size > 0) selectOnly([...there].filter((u) => memberIds.includes(u)));
    if (!existing && !id) selectOnly(memberIds);
  };

  const amount = parseEuro(amountText);
  const ids = useMemo(() => members.filter((m) => selected[m.user_id]).map((m) => m.user_id), [members, selected]);
  // Der Extra-Cent bei krummen Beträgen wandert von Ausgabe zu Ausgabe weiter
  const seed = useMemo(() => expenses.filter((e) => e.id !== expenseId).length, [expenses, expenseId]);

  const shares = useMemo(() => {
    if (amount == null) return new Map<string, number>();
    if (mode === 'gleich') return splitEqually(amount, ids, seed);
    if (mode === 'anteile') return splitByWeights(amount, ids.map((id) => ({ userId: id, weight: weights[id] ?? 1 })), seed);
    return new Map(ids.map((id) => [id, parseEuro(amounts[id] ?? '') ?? 0]));
  }, [amount, mode, ids, seed, weights, amounts]);

  const distributed = [...shares.values()].reduce((a, b) => a + b, 0);
  const remaining = (amount ?? 0) - distributed;

  if (!round || !userId) return null;

  const save = async () => {
    setError(null);
    if (amount == null || amount <= 0) return setError('Bitte gib einen gültigen Betrag ein, z. B. 12,50.');
    if (ids.length === 0) return setError('Mindestens eine Person muss beteiligt sein.');
    if (remaining !== 0) return setError(remaining > 0 ? `Es fehlen noch ${formatEuro(remaining)} bei den Beträgen.` : `Die Beträge sind ${formatEuro(-remaining)} zu hoch.`);
    setBusy(true);
    const { error } = await supabase.rpc('save_expense', {
      p_round: round.id, p_id: existing?.id ?? null, p_title: title.trim() || stations.find((s) => s.id === stationId)?.name || 'Ausgabe', p_amount_cents: amount, p_payer: payer, p_station: stationId, p_split_mode: mode,
      p_shares: ids.map((id) => ({ user_id: id, cents: shares.get(id) ?? 0, weight: mode === 'anteile' ? (weights[id] ?? 1) : null })),
    });
    setBusy(false);
    if (error) return setError(errorText(error));
    setSaved(true);
    setTimeout(() => router.back(), 0);
  };

  const remove = () => {
    showAlert('Ausgabe löschen?', existing!.title, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => {
        const { error } = await supabase.rpc('delete_expense', { p_id: existing!.id });
        if (error) return showAlert('Das hat nicht geklappt', errorText(error));
        setSaved(true);
        setTimeout(() => router.back(), 0);
      } },
    ]);
  };

  const fillRest = (id: string) => {
    const current = parseEuro(amounts[id] ?? '') ?? 0;
    if (current + remaining >= 0) setAmounts((a) => ({ ...a, [id]: centsToInput(current + remaining) }));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior="padding" automaticOffset>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.l, paddingBottom: insets.bottom + space.xl, gap: space.xl }}>
        {missing && (
          <View style={{ backgroundColor: c.sunSoft, borderRadius: radius.m, padding: space.m }}>
            <Body small>Diese Ausgabe wurde inzwischen gelöscht.</Body>
          </View>
        )}
        {!missing && formerParticipants > 0 && (
          <View style={{ backgroundColor: c.sunSoft, borderRadius: radius.m, padding: space.m }}>
            <Body small>An dieser Ausgabe sind Personen beteiligt, die den Hop verlassen haben. Damit ihre Anteile erhalten bleiben, lässt sie sich nicht mehr ändern.</Body>
          </View>
        )}
        {!missing && formerParticipants === 0 && !canEdit && (
          <View style={{ backgroundColor: c.sunSoft, borderRadius: radius.m, padding: space.m }}>
            <Body small>Ändern können diese Ausgabe nur, wer sie eingetragen oder bezahlt hat, und die Organisation.</Body>
          </View>
        )}

        <View style={{ alignItems: 'center', gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <TextInput value={amountText} onChangeText={setAmountText} editable={canEdit} placeholder="0,00" placeholderTextColor={c.line} keyboardType="decimal-pad"
              autoFocus={!existing} maxLength={10} accessibilityLabel="Betrag in Euro"
              style={{ fontFamily: fonts.display, fontSize: 56, color: c.ink, minWidth: 130, textAlign: 'right', padding: 0 }} />
            <Text style={{ fontFamily: fonts.display, fontSize: 36, color: c.muted }}>€</Text>
          </View>
          {amountText.length > 0 && amount == null && <Body small style={{ color: c.danger }}>Kein gültiger Betrag</Body>}
        </View>

        <Field label="Wofür? (optional)" value={title} onChangeText={setTitle} editable={canEdit} placeholder="z. B. Pizza, Taxi, Eintritt" maxLength={80} />

        <View>
          <SectionLabel>Bezahlt von</SectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
            {members.map((m) => (
              <Chip key={m.user_id} label={m.user_id === userId ? 'Ich' : m.profile.display_name} active={payer === m.user_id}
                onPress={canEdit ? () => setPayer(m.user_id) : undefined} />
            ))}
          </ScrollView>
        </View>

        {stations.length > 0 && (
          <View>
            <SectionLabel>Station (optional)</SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
              <Chip label="Keine" active={stationId === null} onPress={canEdit ? () => chooseStation(null) : undefined} />
              {stations.map((s, i) => (
                <Chip key={s.id} label={`${i + 1} · ${s.name}`} active={stationId === s.id} onPress={canEdit ? () => chooseStation(s.id) : undefined} />
              ))}
            </ScrollView>
          </View>
        )}

        <View style={{ gap: space.m }}>
          <SectionLabel style={{ marginBottom: 0 }}>Aufteilen</SectionLabel>
          {canEdit && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
              <Chip label={`Alle (${memberIds.length})`} icon="people" active={ids.length === memberIds.length} onPress={() => selectOnly(memberIds)} />
              {stations.filter((s) => (attendees.ever.get(s.id)?.size ?? 0) > 0).map((s) => {
                const who = [...attendees.ever.get(s.id)!].filter((u) => memberIds.includes(u));
                const on = who.length === ids.length && who.every((u) => selected[u]);
                return <Chip key={s.id} icon="location" label={`Waren an ${s.name} (${who.length})`} active={on} onPress={() => selectOnly(who)} />;
              })}
              {stationId && (attendees.now.get(stationId)?.size ?? 0) > 0 && (
                <Chip icon="radio-button-on" label={`Gerade dort (${attendees.now.get(stationId)!.size})`}
                  onPress={() => selectOnly([...attendees.now.get(stationId)!])} />
              )}
            </ScrollView>
          )}
          {!existing && stationId && (attendees.ever.get(stationId)?.size ?? 0) > 0 && (
            <Body muted small>Vorausgewählt: alle, die an dieser Station eingecheckt waren. Du kannst einzelne Personen an- oder abwählen.</Body>
          )}
          {canEdit && (
            <Segmented value={mode} onChange={setMode}
              options={[{ value: 'gleich', label: 'Gleichmäßig' }, { value: 'anteile', label: 'Anteile' }, { value: 'betrag', label: 'Beträge' }]} />
          )}
          <Card style={{ paddingVertical: space.xs }}>
            {members.map((m, i) => {
              const on = !!selected[m.user_id];
              return (
                <View key={m.user_id}>
                  {i > 0 && <Divider />}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 60 }}>
                    <Pressable disabled={!canEdit} onPress={() => setSelected((s) => ({ ...s, [m.user_id]: !on }))} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, flex: 1, minHeight: 56 }}>
                      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={26} color={on ? c.accent : c.muted} />
                      <Avatar profile={m.profile} size={32} dimmed={!on} />
                      <Body bold={on} muted={!on} numberOfLines={1} style={{ flex: 1 }}>{m.user_id === userId ? 'Ich' : m.profile.display_name}</Body>
                    </Pressable>
                    {on && mode === 'anteile' && canEdit && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        <Pressable hitSlop={6} accessibilityLabel="Weniger Anteile" onPress={() => setWeights((w) => ({ ...w, [m.user_id]: Math.max(1, (w[m.user_id] ?? 1) - 1) }))}
                          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="remove-circle-outline" size={26} color={c.ink} />
                        </Pressable>
                        <Text style={{ color: c.ink, fontWeight: '700', fontSize: 16, minWidth: 26, textAlign: 'center' }}>{weights[m.user_id] ?? 1}×</Text>
                        <Pressable hitSlop={6} accessibilityLabel="Mehr Anteile" onPress={() => setWeights((w) => ({ ...w, [m.user_id]: Math.min(20, (w[m.user_id] ?? 1) + 1) }))}
                          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="add-circle-outline" size={26} color={c.ink} />
                        </Pressable>
                      </View>
                    )}
                    {on && mode === 'betrag' && canEdit ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {remaining !== 0 && amount != null && (
                          <Pressable onPress={() => fillRest(m.user_id)} hitSlop={8} accessibilityLabel="Rest hier eintragen">
                            <Ionicons name="arrow-down-circle-outline" size={24} color={c.accent} />
                          </Pressable>
                        )}
                        <TextInput value={amounts[m.user_id] ?? ''} onChangeText={(t) => setAmounts((a) => ({ ...a, [m.user_id]: t }))} placeholder="0,00"
                          placeholderTextColor={c.muted} keyboardType="decimal-pad" maxLength={10}
                          style={{ width: 92, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.bg, paddingHorizontal: 10, fontSize: 16, color: c.ink, textAlign: 'right' }} />
                      </View>
                    ) : (
                      <Text style={{ color: on ? c.ink : c.muted, fontSize: 16, fontWeight: '600', minWidth: 76, textAlign: 'right' }}>
                        {on && amount != null ? formatEuro(shares.get(m.user_id) ?? 0) : '–'}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </Card>
          {mode === 'betrag' && amount != null && (
            <Body small bold style={{ color: remaining === 0 ? c.teal : c.danger }}>
              {remaining === 0 ? 'Geht genau auf.' : remaining > 0 ? `Noch zu verteilen: ${formatEuro(remaining)}` : `Zu viel verteilt: ${formatEuro(-remaining)}`}
            </Body>
          )}
          {mode !== 'betrag' && <Body muted small>Auf den Cent genau: Übrige Cent werden reihum verteilt, damit die Summe exakt stimmt.</Body>}
        </View>

        {error && <Body style={{ color: c.danger }}>{error}</Body>}
        {canEdit && <Button title={existing ? 'Änderungen speichern' : 'Ausgabe speichern'} onPress={save} loading={busy} />}
        {existing && canEdit && <Button title="Ausgabe löschen" variant="danger" icon="trash-outline" onPress={remove} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
