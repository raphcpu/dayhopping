import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { stationColor } from '@/lib/stationColors';
import { useAuth } from '@/providers/AuthProvider';
import { useRound } from '@/providers/RoundProvider';
import { Fireworks } from './Fireworks';

/**
 * Feuerwerk, Vibration und Hinweis, sobald man selbst an einer Station eingecheckt wird.
 * Nur für neue Check-ins während die App läuft, nicht für alte beim Öffnen.
 */
export function CheckinCelebration() {
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const { loading, checkins, stations } = useRound();
  const seen = useRef<Set<string> | null>(null);
  const [show, setShow] = useState<{ n: number; name: string; color: string } | null>(null);
  const [banner] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (loading || !userId) return;
    const mine = checkins.filter((c) => c.user_id === userId);
    if (seen.current === null) {
      seen.current = new Set(mine.map((c) => c.id)); // Stand beim Öffnen: nichts feiern
      return;
    }
    const fresh = mine.find((c) => !c.left_at && !seen.current!.has(c.id));
    mine.forEach((c) => seen.current!.add(c.id));
    if (!fresh) return;
    const index = stations.findIndex((s) => s.id === fresh.station_id);
    const station = stations[index];
    setShow({ n: Date.now(), name: station?.name ?? 'Station', color: station ? stationColor(station, index) : '#FF5A36' });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    banner.setValue(0);
    Animated.sequence([
      Animated.spring(banner, { toValue: 1, useNativeDriver: true, friction: 6 }),
      Animated.delay(2600),
      Animated.timing(banner, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [loading, checkins, stations, userId, banner]);

  if (!show) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
      <Fireworks key={show.n} color={show.color} onFinished={() => setShow(null)} />
      <Animated.View style={{ position: 'absolute', top: insets.top + 70, left: 24, right: 24, alignItems: 'center',
        opacity: banner, transform: [{ scale: banner.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
        <View style={{ backgroundColor: '#1E1B16', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8,
          shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={18} color="#fff" />
          </View>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }} numberOfLines={1}>Eingecheckt: {show.name}</Text>
        </View>
      </Animated.View>
    </View>
  );
}
