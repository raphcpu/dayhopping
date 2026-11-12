import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Avatar, Body, Button, Card, Chip, Divider, EmptyState, ListRow, SectionLabel, Sheet } from '@/components/ui';
import { shareCostsCsv, sharePdf } from '@/lib/export';
import { errorText, formatTime } from '@/lib/format';
import { computeBalances, formatEuro, settleUp, type Transfer } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { fonts, space, useColors } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useRound } from '@/providers/RoundProvider';

export default function CostsTab() {
  const c = useColors();
  const router = useRouter();
  const { userId } = useAuth();
  const { round, members, stations, checkins, expenses, settlements, isOrganizer, profileOf } = useRound();
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null); // Station oder null = alle

  const balances = useMemo(() => computeBalances(expenses, settlements, members.map((m) => m.user_id)), [expenses, settlements, members]);
  const transfers = useMemo(() => settleUp(balances), [balances]);
  const total = expenses.reduce((s, e) => s + e.amount_cents, 0);
  const mine = (userId && balances.get(userId)) || 0;
  const stationName = useMemo(() => new Map(stations.map((s) => [s.id, s.name])), [stations]);

  // Bilanz wie bei Tricount: bezahlt, eigener Anteil, Saldo je Person
  const bilanz = useMemo(() => members.map((m) => {
    const paid = expenses.filter((e) => e.payer_id === m.user_id).reduce((s, e) => s + e.amount_cents, 0);
    const share = expenses.reduce((s, e) => s + (e.shares.find((x) => x.user_id === m.user_id)?.share_cents ?? 0), 0);
    return { member: m, paid, share, balance: balances.get(m.user_id) ?? 0 };
  }).sort((a, b) => b.balance - a.balance), [members, expenses, balances]);
  const maxAbs = Math.max(1, ...bilanz.map((b) => Math.abs(b.balance)));

  const usedStations = useMemo(() => stations.filter((s) => expenses.some((e) => e.station_id === s.id)), [stations, expenses]);
  const shown = filter === null ? expenses : filter === 'ohne' ? expenses.filter((e) => !e.station_id) : expenses.filter((e) => e.station_id === filter);
  const shownTotal = shown.reduce((s, e) => s + e.amount_cents, 0);

  if (!round || !userId) return null;

  const settle = (t: Transfer) => {
    const from = profileOf(t.from).display_name;
    const to = profileOf(t.to).display_name;
    Alert.alert('Zahlung erledigt?', `${from} hat ${to} ${formatEuro(t.cents)} gegeben.`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Ja, erledigt', onPress: async () => {
        const { error } = await supabase.from('settlements').insert({ round_id: round.id, from_user: t.from, to_user: t.to, amount_cents: t.cents });
        if (error) Alert.alert('Das hat nicht geklappt', errorText(error));
      } },
    ]);
  };

  const undo = (id: string) => {
    Alert.alert('Zahlung zurücknehmen?', 'Der Betrag gilt dann wieder als offen.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Zurücknehmen', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('settlements').delete().eq('id', id);
        if (error) Alert.alert('Das hat nicht geklappt', errorText(error));
      } },
    ]);
  };

  const doExport = async (kind: 'pdf' | 'csv') => {
    setBusy(kind);
    try {
      const data = { round, members, stations, checkins, expenses, settlements };
      if (kind === 'pdf') await sharePdf(data);
      else await shareCostsCsv(data);
      setExportOpen(false);
    } catch (e) {
      Alert.alert('Export fehlgeschlagen', errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: space.l, paddingBottom: 110, gap: space.xl }}>
        <Card style={{ backgroundColor: c.ink, borderWidth: 0, gap: space.l }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: c.bg, opacity: 0.7, fontSize: 13, fontWeight: '600' }}>GESAMT</Text>
              <Text style={{ color: c.bg, fontFamily: fonts.display, fontSize: 34, letterSpacing: -1 }}>{formatEuro(total)}</Text>
            </View>
            <Button small variant="soft" icon="share-outline" title="Export" onPress={() => setExportOpen(true)} style={{ alignSelf: 'flex-start' }} />
          </View>
          <View style={{ backgroundColor: mine > 0 ? c.teal : mine < 0 ? c.accent : 'rgba(127,127,127,0.25)', borderRadius: 14, padding: space.m, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>{mine > 0 ? 'Du bekommst noch' : mine < 0 ? 'Du schuldest noch' : 'Du bist ausgeglichen'}</Text>
            {mine !== 0 && <Text style={{ color: '#fff', fontSize: 19, fontWeight: '800' }}>{formatEuro(Math.abs(mine))}</Text>}
          </View>
        </Card>

        {transfers.length > 0 && (
          <View>
            <SectionLabel>Wer zahlt wem?</SectionLabel>
            <Card style={{ paddingVertical: space.s }}>
              {transfers.map((t, i) => {
                const may = t.from === userId || t.to === userId || isOrganizer;
                return (
                  <View key={`${t.from}-${t.to}`}>
                    {i > 0 && <Divider />}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m }}>
                      <Avatar profile={profileOf(t.from)} size={34} />
                      <View style={{ flex: 1 }}>
                        <Body bold numberOfLines={1}>{t.from === userId ? 'Du' : profileOf(t.from).display_name}</Body>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="arrow-forward" size={13} color={c.muted} />
                          <Body muted small numberOfLines={1}>{t.to === userId ? 'dir' : profileOf(t.to).display_name}</Body>
                        </View>
                      </View>
                      <Text style={{ color: c.ink, fontSize: 17, fontWeight: '800' }}>{formatEuro(t.cents)}</Text>
                      {may && <Button small variant="soft" title="Erledigt" onPress={() => settle(t)} />}
                    </View>
                  </View>
                );
              })}
            </Card>
          </View>
        )}

        {expenses.length > 0 && (
          <View>
            <SectionLabel>Bilanz</SectionLabel>
            <Card style={{ paddingVertical: space.s }}>
              {bilanz.map((b, i) => (
                <View key={b.member.user_id}>
                  {i > 0 && <Divider />}
                  <View style={{ paddingVertical: space.m, gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
                      <Avatar profile={b.member.profile} size={32} />
                      <View style={{ flex: 1 }}>
                        <Body bold numberOfLines={1}>{b.member.user_id === userId ? 'Du' : b.member.profile.display_name}</Body>
                        <Body muted small>bezahlt {formatEuro(b.paid)} · Anteil {formatEuro(b.share)}</Body>
                      </View>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: b.balance > 0 ? c.teal : b.balance < 0 ? c.danger : c.muted }}>
                        {formatEuro(b.balance, true)}
                      </Text>
                    </View>
                    {/* Balken: grün nach rechts = bekommt Geld, rot nach links = schuldet */}
                    <View style={{ flexDirection: 'row', height: 6 }}>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        {b.balance < 0 && <View style={{ width: `${(Math.abs(b.balance) / maxAbs) * 100}%`, height: 6, borderRadius: 3, backgroundColor: c.danger }} />}
                      </View>
                      <View style={{ width: 2, backgroundColor: c.line }} />
                      <View style={{ flex: 1 }}>
                        {b.balance > 0 && <View style={{ width: `${(b.balance / maxAbs) * 100}%`, height: 6, borderRadius: 3, backgroundColor: c.teal }} />}
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </Card>
          </View>
        )}

        <View>
          <SectionLabel>Ausgaben</SectionLabel>
          {expenses.length > 0 && (usedStations.length > 0) && (
            <View style={{ gap: space.s, marginBottom: space.m }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
                <Chip label="Alle" active={filter === null} onPress={() => setFilter(null)} />
                {usedStations.map((s) => <Chip key={s.id} icon="location" label={s.name} active={filter === s.id} onPress={() => setFilter(s.id)} />)}
                {expenses.some((e) => !e.station_id) && <Chip label="Ohne Station" active={filter === 'ohne'} onPress={() => setFilter('ohne')} />}
              </ScrollView>
              {filter !== null && <Body muted small>{shown.length} {shown.length === 1 ? 'Ausgabe' : 'Ausgaben'} · zusammen {formatEuro(shownTotal)}</Body>}
            </View>
          )}
          {expenses.length === 0 ? (
            <EmptyState icon="wallet" title="Noch keine Ausgaben" text="Trag ein, wer was bezahlt hat. DayHop rechnet auf den Cent genau aus, wer wem wie viel schuldet." />
          ) : (
            <Card style={{ paddingVertical: space.s }}>
              {shown.map((e, i) => {
                const share = e.shares.find((s) => s.user_id === userId)?.share_cents ?? 0;
                return (
                  <View key={e.id}>
                    {i > 0 && <Divider />}
                    <ListRow
                      onPress={() => router.push(`/round/${round.id}/expense?expenseId=${e.id}`)}
                      left={<Avatar profile={profileOf(e.payer_id)} size={38} />}
                      title={e.title}
                      subtitle={[`${e.payer_id === userId ? 'Du hast' : `${profileOf(e.payer_id).display_name} hat`} bezahlt`, e.station_id && stationName.get(e.station_id), formatTime(e.created_at)].filter(Boolean).join(' · ')}
                      right={
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ color: c.ink, fontSize: 16, fontWeight: '700' }}>{formatEuro(e.amount_cents)}</Text>
                          <Body muted small>{share > 0 ? `dein Teil ${formatEuro(share)}` : 'ohne dich'}</Body>
                        </View>
                      }
                    />
                  </View>
                );
              })}
            </Card>
          )}
        </View>

        {settlements.length > 0 && (
          <View>
            <SectionLabel>Erledigte Zahlungen</SectionLabel>
            <Card style={{ paddingVertical: space.s }}>
              {settlements.map((s, i) => {
                const may = s.from_user === userId || s.to_user === userId || isOrganizer;
                return (
                  <View key={s.id}>
                    {i > 0 && <Divider />}
                    <ListRow
                      left={<Ionicons name="checkmark-circle" size={26} color={c.teal} />}
                      title={`${profileOf(s.from_user).display_name} → ${profileOf(s.to_user).display_name}`}
                      subtitle={formatEuro(s.amount_cents)}
                      right={may ? <Button small variant="ghost" title="Zurück" onPress={() => undo(s.id)} /> : undefined}
                    />
                  </View>
                );
              })}
            </Card>
          </View>
        )}
      </ScrollView>

      <View style={{ position: 'absolute', right: space.l, bottom: space.l }}>
        <Button title="Ausgabe" icon="add" onPress={() => router.push(`/round/${round.id}/expense`)}
          style={{ elevation: 5, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, paddingHorizontal: 24 }} />
      </View>

      <Sheet visible={exportOpen} onClose={() => setExportOpen(false)} title="Exportieren">
        <Body muted>Zum Teilen, Ablegen oder Ausdrucken.</Body>
        <Button title="Bericht als PDF" icon="document-text-outline" onPress={() => doExport('pdf')} loading={busy === 'pdf'} />
        <Button title="Kosten als CSV (Excel)" variant="soft" icon="grid-outline" onPress={() => doExport('csv')} loading={busy === 'csv'} />
      </Sheet>
    </View>
  );
}
