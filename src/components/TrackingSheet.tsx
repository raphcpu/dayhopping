import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Platform, Switch, View } from 'react-native';
import { useBatteryOptimized } from '@/lib/battery';
import { supabase } from '@/lib/supabase';
import { space, useColors } from '@/lib/theme';
import { useRound } from '@/providers/RoundProvider';
import { Body, Button, Card, Sheet } from './ui';

/** Erklärt die Ortung, bevor das System nach der Berechtigung fragt, und lässt sie pausieren. */
export function TrackingSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useColors();
  const { round, me, tracking, askTracking, reload, refreshTracking } = useRound();
  const [busy, setBusy] = useState(false);
  const battery = useBatteryOptimized();
  if (!round || !me) return null;

  const setSharing = async (sharing: boolean) => {
    await supabase.rpc('set_member_prefs', { p_round: round.id, p_sharing: sharing, p_muted: null });
    await reload();
    await refreshTracking();
  };

  const allow = async () => {
    setBusy(true);
    await askTracking();
    setBusy(false);
  };

  const point = (icon: keyof typeof Ionicons.glyphMap, text: string) => (
    <View style={{ flexDirection: 'row', gap: space.m, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={22} color={c.teal} style={{ marginTop: 1 }} />
      <Body style={{ flex: 1 }}>{text}</Body>
    </View>
  );

  return (
    <Sheet visible={visible} onClose={onClose} title="Standort teilen">
      <Body bold>
        DayHop erfasst Standortdaten, um deinen Live-Standort mit deiner Gruppe zu teilen und dich automatisch an Stationen einzuchecken – auch wenn die App geschlossen ist oder nicht verwendet wird.
      </Body>
      <View style={{ gap: space.m }}>
        {point('people', 'Alle in diesem Hop sehen live auf der Karte, wo du bist – sonst niemand.')}
        {point('checkmark-circle', 'Kommst du an einer Station an, wirst du automatisch eingecheckt.')}
        {point('timer', 'Geteilt wird nur, solange der Hop läuft. Danach wird dein Standort gelöscht. Ein Bewegungsverlauf wird nicht gespeichert.')}
      </View>

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        <View style={{ flex: 1 }}>
          <Body bold>In diesem Hop teilen</Body>
          <Body muted small>{me.sharing ? 'Du bist für die Gruppe sichtbar.' : 'Pausiert – du bist nicht auf der Karte.'}</Body>
        </View>
        <Switch value={me.sharing} onValueChange={setSharing} trackColor={{ true: c.teal }} />
      </Card>

      {round.status !== 'aktiv' && <Body muted small>Der Hop läuft gerade nicht. Die Ortung startet erst, wenn die Organisation ihn startet.</Body>}

      {round.status === 'aktiv' && me.sharing && tracking === 'keine-berechtigung' && (
        <Button title="Standortzugriff erlauben" icon="navigate" onPress={allow} loading={busy} />
      )}
      {round.status === 'aktiv' && me.sharing && tracking === 'vordergrund' && (
        <View style={{ gap: space.m }}>
          <View style={{ backgroundColor: c.sunSoft, borderRadius: 16, padding: space.l }}>
            <Body small>Im Moment wird dein Standort nur geteilt, solange DayHop geöffnet ist. Wähle in den Einstellungen beim Standort „Immer“, damit es auch bei gesperrtem Handy klappt.</Body>
          </View>
          <Button title="„Immer“ erlauben" icon="navigate" onPress={allow} loading={busy} />
          <Button title="Einstellungen öffnen" variant="soft" icon="settings-outline" onPress={() => Linking.openSettings()} />
        </View>
      )}
      {Platform.OS === 'android' && me.sharing && battery.optimized && (
        <View style={{ gap: space.m, backgroundColor: c.sunSoft, borderRadius: 16, padding: space.l }}>
          <Body small>
            <Body small bold>Akku-Optimierung ist an.</Body> Android beendet die Ortung dann oft nach ein paar Minuten im Hintergrund. Schalte sie für DayHop aus, damit deine Gruppe dich durchgehend sieht.
          </Body>
          <Button title="Akku-Optimierung ausschalten" icon="battery-charging" onPress={battery.disable} />
          <Body muted small>Bei Samsung zusätzlich: Einstellungen → Akku → Hintergrundnutzungslimits → „Nie in Standby versetzte Apps“ → DayHop hinzufügen.</Body>
        </View>
      )}
      {Platform.OS === 'android' && me.sharing && !battery.optimized && (
        <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'center' }}>
          <Ionicons name="battery-charging" size={18} color={c.teal} />
          <Body small style={{ color: c.teal }}>Akku-Optimierung ist für DayHop aus.</Body>
        </View>
      )}
      {round.status === 'aktiv' && me.sharing && tracking === 'hintergrund' && (
        <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'center' }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c.teal }} />
          <Body small style={{ color: c.teal }}>Dein Standort wird geteilt, auch im Hintergrund.</Body>
        </View>
      )}
    </Sheet>
  );
}
