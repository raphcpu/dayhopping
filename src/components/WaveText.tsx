import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, type StyleProp, Text, type TextStyle, View } from 'react-native';

type Props = {
  text: string;
  style?: StyleProp<TextStyle>;
  /** Pause zwischen zwei Wellen in Millisekunden */
  every?: number;
  /** Wie hoch die Buchstaben hüpfen */
  height?: number;
};

/**
 * Text, durch dessen Buchstaben ab und zu eine Welle läuft. Bei "Bewegung reduzieren"
 * und bei sehr langen Texten (die umbrechen oder gekürzt werden müssen) bleibt er ruhig.
 */
export function WaveText({ text, style, every = 9000, height = 6 }: Props) {
  const [progress] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);
  const chars = [...text];
  const animate = !reduceMotion && chars.length <= 28;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!animate) return;
    const wave = () => {
      progress.setValue(0);
      Animated.timing(progress, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }).start();
    };
    const first = setTimeout(wave, 1200);
    const timer = setInterval(wave, every);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [animate, every, progress]);

  if (!animate) return <Text style={style} numberOfLines={2}>{text}</Text>;

  const step = 0.6 / Math.max(chars.length, 1);
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={text} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      {chars.map((ch, i) => {
        const start = i * step;
        return (
          <Animated.Text key={i} style={[style, {
            transform: [{ translateY: progress.interpolate({
              inputRange: [0, start, start + 0.15, start + 0.3, 1],
              outputRange: [0, 0, -height, 0, 0],
              extrapolate: 'clamp',
            }) }],
          }]}>{ch === ' ' ? ' ' : ch}</Animated.Text>
        );
      })}
    </View>
  );
}
