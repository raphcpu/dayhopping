import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { initials } from '@/lib/format';
import { LIVE_GREEN, OFFLINE_GREY } from '@/lib/presence';
import { avatarUrl } from '@/lib/supabase';
import { useMarkerSettle } from '@/lib/useMarkerSettle';
import type { Profile } from '@/lib/types';

const MAX_PETALS = 12;

type Props = {
  lat: number; lng: number; number: number; color: string; size: number;
  visited: boolean; selected: boolean; present: Profile[];
  /** je Person in `present`: sendet sie gerade Standort? */
  live?: boolean[];
  onPress: () => void;
  onPetalPress: (userId: string) => void;
};

/**
 * Stationsmarker: Kreis mit Nummer in der Stationsfarbe, darum wie Blütenblätter die
 * Avatare aller, die gerade dort eingecheckt sind. Jedes Blütenblatt ist ein eigener
 * Marker (am selben Punkt, per Anker versetzt), damit es einzeln antippbar ist.
 */
export function StationMarker({ lat, lng, number, color, size, visited, selected, present, live, onPress, onPetalPress }: Props) {
  const n = present.length;
  const petal = n <= 6 ? 32 : n <= 10 ? 28 : 24;
  const ring = size / 2 + petal / 2 + 3; // Abstand Mitte → Mitte Blütenblatt
  const shown = n > MAX_PETALS ? present.slice(0, MAX_PETALS - 1) : present;
  const extra = n - shown.length;
  const slots = shown.length + (extra > 0 ? 1 : 0);
  const coordinate = { latitude: lat, longitude: lng };
  const settling = useMarkerSettle();

  // Anker verschiebt das Bild um (dx, dy) Pixel vom Stationspunkt weg
  const anchorFor = (k: number) => {
    const angle = -Math.PI / 2 + (k / slots) * Math.PI * 2; // oben beginnend, im Uhrzeigersinn
    const box = petal + 4;
    return { x: 0.5 - (ring * Math.cos(angle)) / box, y: 0.5 - (ring * Math.sin(angle)) / box };
  };

  return (
    <>
      <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={settling} zIndex={selected ? 32 : 30} onPress={onPress}>
        <View style={{ width: size + 8, height: size + 8, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderWidth: 3, borderColor: '#fff',
            alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: Math.round(size * 0.42), textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 2 }}>{number}</Text>
          </View>
          {visited && (
            // Haken: Hier warst du schon
            <View style={{ position: 'absolute', bottom: 0, left: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: '#22C55E',
              borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark" size={12} color="#fff" />
            </View>
          )}
        </View>
      </Marker>
      {shown.map((p, k) => (
        <PetalMarker key={`${p.id}-${p.avatar_path}`} coordinate={coordinate} anchor={anchorFor(k)} profile={p} size={petal}
          ringColor={live?.[k] === false ? OFFLINE_GREY : LIVE_GREEN} grey={live?.[k] === false}
          zIndex={selected ? 34 : 31} onPress={() => onPetalPress(p.id)} />
      ))}
      {extra > 0 && (
        <Marker coordinate={coordinate} anchor={anchorFor(shown.length)} tracksViewChanges={settling} zIndex={31} onPress={onPress}>
          <View style={{ width: petal + 4, height: petal + 4, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: petal, height: petal, borderRadius: petal / 2, backgroundColor: '#151821', borderWidth: 2, borderColor: color,
              alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: petal * 0.36 }}>+{extra}</Text>
            </View>
          </View>
        </Marker>
      )}
    </>
  );
}

function PetalMarker({ coordinate, anchor, profile, size, ringColor, grey, zIndex, onPress }: {
  coordinate: { latitude: number; longitude: number }; anchor: { x: number; y: number }; profile: Profile; size: number; ringColor: string; grey?: boolean;
  zIndex: number; onPress: () => void;
}) {
  const url = avatarUrl(profile.avatar_path);
  // Marker sind auf Android Bilder: neu zeichnen, bis das Profilbild geladen ist
  const [loaded, setLoaded] = useState(!url);
  const settling = useMarkerSettle();
  return (
    <Marker coordinate={coordinate} anchor={anchor} tracksViewChanges={settling || !loaded} zIndex={zIndex} onPress={onPress}>
      <View style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center', opacity: grey ? 0.55 : 1 }}>
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: grey ? OFFLINE_GREY : profile.color, borderWidth: 3, borderColor: ringColor,
          overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          {url ? <Image source={{ uri: url }} style={{ width: size, height: size }} onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} /> : (
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{initials(profile.display_name)}</Text>
          )}
        </View>
      </View>
    </Marker>
  );
}
