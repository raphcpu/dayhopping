import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';
import { enableWebPush, type WebPushState, webPushState } from '@/lib/push';
import { space, useColors } from '@/lib/theme';
import { Body, Button, Card, SectionLabel } from './ui';

const TEXT: Record<WebPushState, string> = {
  aktiv: 'Mitteilungen sind an. Du bekommst Chat-Nachrichten, Durchsagen und neue Kosten auch, wenn DayHop geschlossen ist.',
  moeglich: 'Lass dich über Chat-Nachrichten, Durchsagen und neue Kosten informieren, auch wenn DayHop geschlossen ist.',
  abgelehnt: 'Mitteilungen sind für DayHop blockiert. Erlaube sie in den Einstellungen deines Handys unter „Mitteilungen“ → DayHop.',
  installieren: 'Mitteilungen gibt es auf dem iPhone nur, wenn DayHop auf dem Home-Bildschirm liegt: In Safari auf „Teilen“ tippen, dann „Zum Home-Bildschirm“. Danach DayHop von dort öffnen.',
  'nicht-unterstuetzt': 'Dieser Browser kann keine Mitteilungen anzeigen.',
};

/** Nur im Browser sichtbar: Mitteilungen einschalten (muss per Antippen passieren). */
export function WebPushCard() {
  const c = useColors();
  const [state, setState] = useState(() => webPushState());
  const [busy, setBusy] = useState(false);
  if (!state) return null;

  const enable = async () => {
    setBusy(true);
    setState(await enableWebPush());
    setBusy(false);
  };

  return (
    <View>
      <SectionLabel>Mitteilungen</SectionLabel>
      <Card style={{ gap: space.m }}>
        <View style={{ flexDirection: 'row', gap: space.m, alignItems: 'flex-start' }}>
          <Ionicons name={state === 'aktiv' ? 'notifications' : state === 'installieren' ? 'add-circle-outline' : 'notifications-outline'}
            size={22} color={state === 'aktiv' ? c.teal : c.muted} style={{ marginTop: 1 }} />
          <Body small style={{ flex: 1 }}>{TEXT[state]}</Body>
        </View>
        {state === 'moeglich' && <Button title="Mitteilungen einschalten" icon="notifications" onPress={enable} loading={busy} />}
      </Card>
    </View>
  );
}
