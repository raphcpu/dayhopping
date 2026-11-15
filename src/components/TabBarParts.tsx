import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { type ReactNode, useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import type { IconName } from '@/components/ui';
import { useColors } from '@/lib/theme';

const native = Platform.OS !== 'web';

/**
 * Tab-Symbol mit „Pille“ dahinter: Der aktive Tab bekommt einen weichen Akzent-Hintergrund,
 * der beim Wechsel von der Mitte aufzieht, dazu ein gefülltes Symbol in Akzentfarbe.
 */
export function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  const c = useColors();
  const [v] = useState(() => new Animated.Value(focused ? 1 : 0));
  useEffect(() => {
    Animated.timing(v, { toValue: focused ? 1 : 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
  }, [focused, v]);
  return (
    <Animated.View style={{ width: 64, height: 32, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View pointerEvents="none"
        style={{ position: 'absolute', width: 64, height: 32, borderRadius: 16, backgroundColor: c.accentSoft, opacity: v,
          transform: [{ scaleX: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }} />
      <Ionicons name={(focused ? name : `${name}-outline`) as IconName} size={23} color={focused ? c.accent : c.muted} />
    </Animated.View>
  );
}

type ButtonProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: ((e: GestureResponderEvent) => void) | null;
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean };
  'aria-selected'?: boolean;
  testID?: string;
};

/**
 * Tab-Knopf mit sofortigem Druck-Feedback: federt beim Antippen auf 92 % zusammen und
 * zurück, in der App mit leichtem Haptik-Tick. Läuft über den nativen Animationstreiber.
 */
export function TabButton({ children, style, onPress, onLongPress, accessibilityLabel, accessibilityState, testID, ...rest }: ButtonProps) {
  const [scale] = useState(() => new Animated.Value(1));
  const selected = accessibilityState?.selected ?? rest['aria-selected'] ?? false;
  const to = (value: number, fast: boolean) =>
    Animated.spring(scale, { toValue: value, useNativeDriver: native, speed: fast ? 50 : 20, bounciness: fast ? 0 : 8 }).start();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      testID={testID}
      onPress={(e) => {
        if (native && !selected) Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      onLongPress={onLongPress ?? undefined}
      onPressIn={() => to(0.92, true)}
      onPressOut={() => to(1, false)}
      style={[style, { flex: 1 }, Platform.OS === 'web' ? ({ cursor: 'pointer', outlineStyle: 'none' } as object) : null]}>
      {({ hovered }: { hovered?: boolean; pressed: boolean }) => (
        <Animated.View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', transform: [{ scale }], opacity: hovered && !selected ? 0.8 : 1 }}>
          {children}
        </Animated.View>
      )}
    </Pressable>
  );
}
