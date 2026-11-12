import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, Share, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DateField } from '@/components/DateField';
import { showMenu } from '@/components/Menu';
import { TrackingSheet } from '@/components/TrackingSheet';
import { Avatar, Body, Button, Card, Divider, Field, Heading, IconButton, ListRow, SectionLabel, Sheet, StatusPill } from '@/components/ui';
import { shareCostsCsv, sharePdf, shareVisitsCsv } from '@/lib/export';
import { errorText, formatAgo, formatDay, formatDuration, formatTime, parseDay, toDay } from '@/lib/format';
import { deleteMedia } from '@/lib/media';
import { useBatteryOptimized } from '@/lib/battery';
import { stationColor } from '@/lib/stationColors';
import { formatEuro } from '@/lib/money';
import { memberStats, stationStats } from '@/lib/stats';
import { supabase } from '@/lib/supabase';
import { fonts, radius, space, useColors } from '@/lib/theme';
import type { Member, Report, RoundStatus } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useRound } from '@/providers/RoundProvider';

export default function Dashboard() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useAuth();
  const { round, members, stations, locations, checkins, expenses, settlements, media, reports, me, isOrganizer, profileOf, reload } = useRound();
  const [busy, setBusy] = useState<string | null>(null);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [name, setName] = useState(round?.name ?? '');
  const [day, setDay] = useState<Date>(round ? parseDay(round.day) : new Date());
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const battery = useBatteryOptimized();

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const sStats = useMemo(() => stationStats(stations, checkins, now), [stations, checkins, now]);
  const mStats = useMemo(() => new Map(memberStats(members, checkins, now).map((m) => [m.userId, m])), [members, checkins, now]);
  const stationName = useMemo(() => new Map(stations.map((s) => [s.id, s.name])), [stations]);

  if (!round || !me || !userId) return null;

  const fail = (e: unknown) => Alert.alert('Das hat nicht geklappt', errorText(e));
  const run = async (key: string, fn: () => PromiseLike<{ error: unknown } | void>) => {
    setBusy(key);
    try {
      const r = await fn();
      if (r && r.error) fail(r.error);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const setStatus = (status: RoundStatus) => run('status', () => supabase.rpc('set_round_status', { p_round: round.id, p_status: status }));

  const confirmEnd = () =>
    Alert.alert('Hop beenden?', 'Die Ortung stoppt für alle und die Standorte werden gelöscht. Chat, Kosten und Collage bleiben erhalten.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Beenden', style: 'destructive', onPress: () => setStatus('beendet') },
    ]);

  const invite = () =>
    Share.share({ message: `Komm mit zu „${round.name}“ am ${formatDay(round.day)}! Öffne DayHop, tippe auf „Code eingeben“ und gib ${round.invite_code} ein.` });

  const copy = async () => {
    await Clipboard.setStringAsync(round.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const sendAnnouncement = async () => {
    const body = announcement.trim();
    if (!body) return;
    await run('durchsage', () => supabase.from('messages').insert({ round_id: round.id, user_id: userId, kind: 'announcement', body }));
    setAnnouncement('');
    setAnnounceOpen(false);
  };

  const move = (index: number, dir: -1 | 1) => {
    const ids = stations.map((s) => s.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    run('reihenfolge', () => supabase.rpc('reorder_stations', { p_round: round.id, p_ids: ids }));
  };

  const memberMenu = (m: Member) => {
    if (!isOrganizer || m.user_id === userId) return;
    Alert.alert(m.profile.display_name, undefined, [
      m.role === 'organizer'
        ? { text: 'Organisator-Rolle entziehen', onPress: () => run('rolle', () => supabase.rpc('set_member_role', { p_round: round.id, p_user: m.user_id, p_role: 'member' })) }
        : { text: 'Zum Organisator machen', onPress: () => run('rolle', () => supabase.rpc('set_member_role', { p_round: round.id, p_user: m.user_id, p_role: 'organizer' })) },
      { text: 'Aus dem Hop entfernen', style: 'destructive', onPress: () => run('entfernen', () => supabase.rpc('remove_member', { p_round: round.id, p_user: m.user_id })) },
      { text: 'Abbrechen', style: 'cancel' },
    ]);
  };

  const openReports = isOrganizer ? reports.filter((r) => !r.resolved_at) : [];
  const closeReport = (r: Report) => supabase.from('reports').update({ resolved_at: new Date().toISOString(), resolved_by: userId }).eq('id', r.id);

  const handleReport = (r: Report) => {
    const author = r.target_user ? members.find((m) => m.user_id === r.target_user) : undefined;
    showMenu({
      title: r.reason,
      message: `${r.excerpt ?? ''}\n\nGemeldet von ${profileOf(r.reporter_id).display_name}${author ? `, betrifft ${author.profile.display_name}` : ''}`,
      options: [
      ...(r.target_kind !== 'user' ? [{ text: 'Inhalt löschen', icon: 'trash-outline' as const, destructive: true, onPress: () => run('meldung', async () => {
        if (r.target_kind === 'message') {
          const { error } = await supabase.from('messages').delete().eq('id', r.target_id);
          if (error) return { error };
        } else {
          const m = media.find((x) => x.id === r.target_id);
          if (m) await deleteMedia(m);
        }
        return closeReport(r);
      }) }] : []),
      ...(author && author.user_id !== userId ? [{ text: `${author.profile.display_name} aus dem Hop entfernen`, icon: 'person-remove-outline' as const, destructive: true, onPress: () => run('meldung', async () => {
        const { error } = await supabase.rpc('remove_member', { p_round: round.id, p_user: author.user_id });
        if (error) return { error };
        return closeReport(r);
      }) }] : []),
      { text: 'Kein Verstoß – schließen', icon: 'checkmark' as const, onPress: () => run('meldung', () => closeReport(r)) },
      ],
    });
  };

  const saveEdit = async () => {
    if (name.trim().length < 2) return;
    await run('bearbeiten', () => supabase.from('rounds').update({ name: name.trim(), day: toDay(day) }).eq('id', round.id));
    setEditOpen(false);
  };

  const leave = () =>
    Alert.alert('Hop verlassen?', 'Du siehst dann Karte, Chat, Kosten und Collage nicht mehr.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Verlassen', style: 'destructive', onPress: async () => {
        const { error } = await supabase.rpc('remove_member', { p_round: round.id, p_user: userId });
        if (error) return fail(error);
        router.replace('/');
      } },
    ]);

  const destroy = () =>
    Alert.alert('Hop endgültig löschen?', 'Alle Stationen, Nachrichten, Ausgaben, Fotos und Videos werden für alle gelöscht. Das lässt sich nicht rückgängig machen.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Endgültig löschen', style: 'destructive', onPress: async () => {
        const paths = media.flatMap((m) => [m.storage_path, ...(m.thumb_path ? [m.thumb_path] : [])]);
        for (let i = 0; i < paths.length; i += 100) await supabase.storage.from('media').remove(paths.slice(i, i + 100));
        const { error } = await supabase.from('rounds').delete().eq('id', round.id);
        if (error) return fail(error);
        router.replace('/');
      } },
    ]);

  const exportData = { round, members, stations, checkins, expenses, settlements };
  const total = expenses.reduce((s, e) => s + e.amount_cents, 0);
  const onSite = new Set(checkins.filter((ch) => !ch.left_at).map((ch) => ch.user_id)).size;
  const otherOrganizers = members.some((m) => m.role === 'organizer' && m.user_id !== userId);

  const tile = (value: string, label: string) => (
    <View style={{ flex: 1, backgroundColor: c.card, borderRadius: radius.m, padding: space.m, borderWidth: 1, borderColor: c.line }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 24, color: c.ink }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Body muted small>{label}</Body>
    </View>
  );

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: space.l, paddingBottom: insets.bottom + space.xxl, gap: space.xl }}>
      {/* Status */}
      <Card style={{ gap: space.m }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.m }}>
          <View style={{ flex: 1 }}>
            <Heading size={24}>{round.name}</Heading>
            <Body muted>{formatDay(round.day)}</Body>
          </View>
          <StatusPill status={round.status} />
        </View>
        {isOrganizer && (
          <>
            {round.status === 'geplant' && (
              <>
                <Body muted small>Mit dem Start beginnt die Ortung: Alle sehen sich live auf der Karte und werden an den Stationen automatisch eingecheckt.</Body>
                <Button title="Hop starten" icon="play" onPress={() => setStatus('aktiv')} loading={busy === 'status'} disabled={stations.length === 0} />
                {stations.length === 0 && <Body muted small>Lege zuerst mindestens eine Station an.</Body>}
              </>
            )}
            {round.status === 'aktiv' && <Button title="Hop beenden" variant="soft" icon="stop" onPress={confirmEnd} loading={busy === 'status'} />}
            {round.status === 'beendet' && <Button title="Hop wieder starten" variant="soft" icon="refresh" onPress={() => setStatus('aktiv')} loading={busy === 'status'} />}
            <Button small variant="ghost" icon="create-outline" title="Name und Tag ändern" onPress={() => { setName(round.name); setDay(parseDay(round.day)); setEditOpen(true); }} />
          </>
        )}
      </Card>

      {/* Kennzahlen */}
      <View style={{ flexDirection: 'row', gap: space.s }}>
        {tile(`${members.length}`, members.length === 1 ? 'Person' : 'Personen')}
        {tile(round.status === 'aktiv' ? `${onSite}` : `${stations.length}`, round.status === 'aktiv' ? 'gerade in Stationen' : 'Stationen')}
        {tile(formatEuro(total).replace(',00', ''), 'Ausgaben')}
      </View>

      {/* Einladen */}
      <View>
        <SectionLabel>Einladen</SectionLabel>
        <Card style={{ gap: space.m, alignItems: 'center' }}>
          <Text selectable style={{ fontFamily: fonts.displayHeavy, fontSize: 44, letterSpacing: 8, color: c.ink }}>{round.invite_code}</Text>
          <Body muted small style={{ textAlign: 'center' }}>Wer diesen Code in DayHop eingibt, ist dabei. Gib ihn nur an deine Gruppe weiter.</Body>
          <View style={{ flexDirection: 'row', gap: space.s, alignSelf: 'stretch' }}>
            <Button title={copied ? 'Kopiert' : 'Kopieren'} variant="soft" icon={copied ? 'checkmark' : 'copy-outline'} onPress={copy} style={{ flex: 1 }} />
            <Button title="Teilen" icon="share-outline" onPress={invite} style={{ flex: 1 }} />
          </View>
        </Card>
      </View>

      {openReports.length > 0 && (
        <View>
          <SectionLabel>Meldungen ({openReports.length})</SectionLabel>
          <Card style={{ paddingVertical: space.s, borderColor: c.danger, borderWidth: 1.5 }}>
            {openReports.map((r, i) => (
              <View key={r.id}>
                {i > 0 && <Divider />}
                <ListRow onPress={() => handleReport(r)} left={<Ionicons name="flag" size={22} color={c.danger} />} title={r.reason}
                  subtitle={`${r.excerpt ?? ''} · ${formatAgo(r.created_at, now)}`} right={<Ionicons name="chevron-forward" size={20} color={c.muted} />} />
              </View>
            ))}
          </Card>
        </View>
      )}

      {isOrganizer && (
        <Button title="Durchsage an alle" variant="sun" icon="megaphone" onPress={() => setAnnounceOpen(true)} />
      )}

      {/* Stationen mit Besuchsstatistik */}
      <View>
        <SectionLabel>Stationen</SectionLabel>
        <Card style={{ paddingVertical: space.s }}>
          {sStats.length === 0 && <Body muted style={{ paddingVertical: space.m }}>Noch keine Stationen.</Body>}
          {sStats.map((s, i) => (
            <View key={s.station.id}>
              {i > 0 && <Divider />}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: stationColor(s.station, i), alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Body bold numberOfLines={1}>{s.station.name}</Body>
                  <Body muted small>
                    {[s.station.planned_at ? `${formatTime(s.station.planned_at)} Uhr` : null, `${s.visitors.length}/${members.length} waren da`,
                      s.present.length ? `${s.present.length} jetzt da` : null, s.avgStayMs != null ? `Ø ${formatDuration(s.avgStayMs)}` : null].filter(Boolean).join(' · ')}
                  </Body>
                </View>
                {isOrganizer && (
                  <View style={{ flexDirection: 'row' }}>
                    <IconButton icon="arrow-up" label="Nach vorn" size={38} color={i === 0 ? c.line : c.ink} onPress={() => move(i, -1)} />
                    <IconButton icon="arrow-down" label="Nach hinten" size={38} color={i === sStats.length - 1 ? c.line : c.ink} onPress={() => move(i, 1)} />
                    <IconButton icon="create-outline" label="Bearbeiten" size={38} onPress={() => router.push(`/round/${round.id}/station?stationId=${s.station.id}`)} />
                  </View>
                )}
              </View>
            </View>
          ))}
        </Card>
        {isOrganizer && <Button title="Station hinzufügen" variant="soft" icon="add" onPress={() => router.push(`/round/${round.id}/station`)} style={{ marginTop: space.s }} />}
      </View>

      {/* Mitglieder mit Live-Status */}
      <View>
        <SectionLabel>Wer ist wo?</SectionLabel>
        <Card style={{ paddingVertical: space.s }}>
          {members.map((m, i) => {
            const st = mStats.get(m.user_id);
            const loc = locations.find((l) => l.user_id === m.user_id);
            const where = round.status !== 'aktiv'
              ? `${st?.visited ?? 0} von ${stations.length} Stationen besucht`
              : st?.currentStationId
                ? `In ${stationName.get(st.currentStationId) ?? 'einer Station'} · ${st.visited}/${stations.length} besucht`
                : !m.sharing
                  ? `Standort pausiert · ${st?.visited ?? 0}/${stations.length} besucht`
                  : loc
                    ? `Unterwegs · Standort ${formatAgo(loc.recorded_at, now)} · ${st?.visited ?? 0}/${stations.length} besucht`
                    : `Noch kein Standort · ${st?.visited ?? 0}/${stations.length} besucht`;
            return (
              <View key={m.user_id}>
                {i > 0 && <Divider />}
                <ListRow
                  onPress={isOrganizer && m.user_id !== userId ? () => memberMenu(m) : undefined}
                  left={<Avatar profile={m.profile} size={40} ring={st?.currentStationId ? c.teal : undefined} />}
                  title={m.user_id === userId ? `${m.profile.display_name} (du)` : m.profile.display_name}
                  subtitle={where}
                  right={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {m.role === 'organizer' && <Ionicons name="star" size={16} color={c.sun} accessibilityLabel="Organisator" />}
                      {isOrganizer && m.user_id !== userId && <Ionicons name="ellipsis-horizontal" size={20} color={c.muted} />}
                    </View>
                  }
                />
              </View>
            );
          })}
        </Card>
      </View>

      {/* Eigene Einstellungen */}
      <View>
        <SectionLabel>Deine Einstellungen</SectionLabel>
        <Card style={{ paddingVertical: space.s }}>
          <ListRow onPress={() => setTrackingOpen(true)} left={<Ionicons name="navigate" size={24} color={c.teal} />} title="Standort teilen"
            subtitle={me.sharing ? 'An – solange der Hop läuft' : 'Pausiert'} right={<Ionicons name="chevron-forward" size={20} color={c.muted} />} />
          {Platform.OS === 'android' && (
            <>
              <Divider />
              <ListRow onPress={battery.optimized ? battery.disable : undefined}
                left={<Ionicons name={battery.optimized ? 'battery-dead' : 'battery-charging'} size={24} color={battery.optimized ? c.danger : c.teal} />}
                title="Akku-Optimierung"
                subtitle={battery.optimized ? 'An – bremst die Ortung. Antippen zum Ausschalten.' : 'Aus – Ortung läuft zuverlässig im Hintergrund.'}
                right={battery.optimized ? <Ionicons name="chevron-forward" size={20} color={c.muted} /> : undefined} />
            </>
          )}
          <Divider />
          <ListRow left={<Ionicons name="notifications-off" size={24} color={c.muted} />} title="Chat stummschalten" subtitle="Durchsagen kommen trotzdem an."
            right={<Switch value={me.muted} trackColor={{ true: c.accent }}
              onValueChange={(v) => run('stumm', async () => { const r = await supabase.rpc('set_member_prefs', { p_round: round.id, p_sharing: null, p_muted: v }); await reload(); return r; })} />} />
        </Card>
      </View>

      {/* Exporte */}
      <View>
        <SectionLabel>Exportieren</SectionLabel>
        <View style={{ gap: space.s }}>
          <Button title="Bericht als PDF" variant="soft" icon="document-text-outline" loading={busy === 'pdf'} onPress={() => run('pdf', () => sharePdf(exportData))} />
          <View style={{ flexDirection: 'row', gap: space.s }}>
            <Button title="Kosten (CSV)" variant="soft" icon="grid-outline" style={{ flex: 1 }} loading={busy === 'csv1'} onPress={() => run('csv1', () => shareCostsCsv(exportData))} />
            <Button title="Besuche (CSV)" variant="soft" icon="grid-outline" style={{ flex: 1 }} loading={busy === 'csv2'} onPress={() => run('csv2', () => shareVisitsCsv(exportData))} />
          </View>
        </View>
      </View>

      <View style={{ gap: space.xs }}>
        {(!isOrganizer || otherOrganizers) && <Button title="Hop verlassen" variant="danger" icon="exit-outline" onPress={leave} />}
        {isOrganizer && <Button title="Hop löschen" variant="danger" icon="trash-outline" onPress={destroy} />}
      </View>

      <TrackingSheet visible={trackingOpen} onClose={() => setTrackingOpen(false)} />

      <Sheet visible={editOpen} onClose={() => setEditOpen(false)} title="Hop bearbeiten">
        <Field label="Name" value={name} onChangeText={setName} maxLength={60} />
        <DateField label="Tag" mode="date" value={day} onChange={(d) => d && setDay(d)} />
        <Button title="Speichern" onPress={saveEdit} loading={busy === 'bearbeiten'} />
      </Sheet>

      <Sheet visible={announceOpen} onClose={() => setAnnounceOpen(false)} title="Durchsage">
        <Field value={announcement} onChangeText={setAnnouncement} placeholder="z. B. In 10 Minuten geht es weiter zur nächsten Station!" multiline autoFocus maxLength={500}
          style={{ minHeight: 110, textAlignVertical: 'top' }} />
        <Body muted small>Erscheint groß im Chat und auf der Karte und geht als Push an alle – auch an stummgeschaltete.</Body>
        <Button title="An alle senden" icon="megaphone" onPress={sendAnnouncement} loading={busy === 'durchsage'} disabled={!announcement.trim()} />
      </Sheet>
    </ScrollView>
  );
}
