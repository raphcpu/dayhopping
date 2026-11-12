import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { initials } from '@/lib/format';
import { avatarUrl } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const MAX_PETALS = 12;

type Props = {
  lat: number; lng: number; number: number; color: string; size: number;
  visited: boolean; selected: boolean; present: Profile[]; onPress: () => void;
};

/**
 * Stationsmarker: Kreis mit Nummer in der Stationsfarbe, darum wie Blütenblätter
 * die Avatare aller, die gerade dort eingecheckt sind.
 */
export function StationMarker({ lat, lng, number, color, size, visited, selected, present, onPress }: Props) {
  const n = present.length;
  const petal = n <= 6 ? 30 : n <= 10 ? 26 : 22;
  const ring = n ? size / 2 + petal / 2 + 3 : 0; // Abstand Mitte → Mitte Blütenblatt
  const box = n ? 2 * (ring + petal / 2) + 6 : size + 8;
  const shown = n > MAX_PETALS ? present.slice(0, MAX_PETALS - 1) : present;
  const extra = n - shown.length;

  // Marker sind auf Android Bilder: neu zeichnen, bis alle Avatarbilder geladen sind
  const withImages = shown.filter((p) => p.avatar_path).length;
  const [loaded, setLoaded] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 5000);
    return () => clearTimeout(t);
  }, []);
  const tracks = !timedOut && loaded < withImages;
  const done = () => setLoaded((x) => x + 1);

  const slots = shown.length + (extra > 0 ? 1 : 0);
  const pos = (k: number) => {
    const angle = -Math.PI / 2 + (k / slots) * Math.PI * 2; // oben beginnend, im Uhrzeigersinn
    return { left: box / 2 + ring * Math.cos(angle) - petal / 2, top: box / 2 + ring * Math.sin(angle) - petal / 2 };
  };

  return (
    <Marker coordinate={{ latitude: lat, longitude: lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracks}
      zIndex={selected ? 32 : 30} onPress={onPress}>
      <View style={{ width: box, height: box }}>
        {shown.map((p, k) => {
          const url = avatarUrl(p.avatar_path);
          return (
            <View key={p.id} style={{ position: 'absolute', ...pos(k), width: petal, height: petal, borderRadius: petal / 2, backgroundColor: p.color,
              borderWidth: 2, borderColor: color, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              {url ? <Image source={{ uri: url }} style={{ width: petal, height: petal }} onLoad={done} onError={done} /> : (
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: petal * 0.38 }}>{initials(p.display_name)}</Text>
              )}
            </View>
          );
        })}
        {extra > 0 && (
          <View style={{ position: 'absolute', ...pos(shown.length), width: petal, height: petal, borderRadius: petal / 2, backgroundColor: '#1E1B16',
            borderWidth: 2, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: petal * 0.36 }}>+{extra}</Text>
          </View>
        )}
        <View style={{ position: 'absolute', left: (box - size) / 2, top: (box - size) / 2, width: size, height: size, borderRadius: size / 2,
          backgroundColor: color, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: Math.round(size * 0.42), textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 2 }}>{number}</Text>
          {visited && (
            // Haken: Hier warst du schon
            <View style={{ position: 'absolute', bottom: -4, left: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: '#22C55E',
              borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark" size={12} color="#fff" />
            </View>
          )}
        </View>
      </View>
    </Marker>
  );
}
