import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { radius, space, useColors } from '@/lib/theme';
import { Body, Heading } from './ui';

/** Platzhalter, wenn die App ohne Google-Maps-Schlüssel gebaut wurde. */
export function MapMissing({ compact }: { compact?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flex: compact ? undefined : 1, minHeight: compact ? 160 : undefined, backgroundColor: c.sunken, borderRadius: compact ? radius.m : 0,
      alignItems: 'center', justifyContent: compact ? 'center' : 'flex-start', padding: space.xl, paddingTop: compact ? space.xl : 120, gap: space.s }}>
      <Ionicons name="map-outline" size={40} color={c.muted} />
      <Heading size={18} style={{ textAlign: 'center' }}>Karte noch nicht eingerichtet</Heading>
      <Body muted small style={{ textAlign: 'center' }}>
        Diese Version wurde ohne Google-Maps-Schlüssel gebaut. Stationen, Check-ins, Chat, Kosten und Collage funktionieren trotzdem.
      </Body>
    </View>
  );
}
