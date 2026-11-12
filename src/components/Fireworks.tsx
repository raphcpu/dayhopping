import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import { RAINBOW } from '@/lib/stationColors';

type Burst = { x: number; y: number; delay: number; colors: string[]; radius: number };

const PARTICLES = 26;

function BurstView({ burst, onDone }: { burst: Burst; onDone?: () => void }) {
  const [progress] = useState(() => new Animated.Value(0));
  // Zufällige Flugbahnen einmal beim Einhängen festlegen
  const [particles] = useState(() => Array.from({ length: PARTICLES }, (_, i) => {
    const angle = (i / PARTICLES) * Math.PI * 2 + Math.random() * 0.2;
    const dist = burst.radius * (0.65 + Math.random() * 0.45);
    return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, color: burst.colors[i % burst.colors.length], size: 6 + Math.random() * 5 };
  }));

  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 1400, delay: burst.delay, easing: Easing.out(Easing.cubic), useNativeDriver: true })
      .start(() => onDone?.());
  }, [progress, burst.delay, onDone]);

  return (
    <View style={{ position: 'absolute', left: burst.x, top: burst.y }}>
      {/* Lichtblitz in der Mitte */}
      <Animated.View style={{ position: 'absolute', left: -24, top: -24, width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFF6C7',
        opacity: progress.interpolate({ inputRange: [0, 0.08, 0.35], outputRange: [0, 0.9, 0] }),
        transform: [{ scale: progress.interpolate({ inputRange: [0, 0.35], outputRange: [0.3, 2.2] }) }] }} />
      {particles.map((p, i) => (
        <Animated.View key={i} style={{
          position: 'absolute', left: -p.size / 2, top: -p.size / 2, width: p.size, height: p.size, borderRadius: p.size / 2, backgroundColor: p.color,
          opacity: progress.interpolate({ inputRange: [0, 0.05, 0.7, 1], outputRange: [0, 1, 0.9, 0] }),
          transform: [
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
            // nach außen fliegen, dann leicht absinken (Schwerkraft)
            { translateY: progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, p.dy * 0.9, p.dy + 60] }) },
            { scale: progress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.4, 1.2, 0.5] }) },
          ],
        }} />
      ))}
    </View>
  );
}

/** Feuerwerk über dem ganzen Bildschirm. Für ein neues Feuerwerk mit neuem `key` einhängen. */
export function Fireworks({ color, onFinished }: { color?: string; onFinished?: () => void }) {
  const { width, height } = useWindowDimensions();
  const [bursts] = useState<Burst[]>(() => {
    const palette = (shift: number) => [...(color ? [color, '#FFFFFF'] : []), ...RAINBOW.slice(shift), ...RAINBOW.slice(0, shift)];
    return Array.from({ length: 5 }, (_, i) => ({
      x: width * (0.2 + Math.random() * 0.6),
      y: height * (0.18 + Math.random() * 0.4),
      delay: i * 260,
      colors: palette(i),
      radius: Math.min(width, 420) * (0.22 + Math.random() * 0.12),
    }));
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bursts.map((b, i) => <BurstView key={i} burst={b} onDone={i === bursts.length - 1 ? onFinished : undefined} />)}
    </View>
  );
}
