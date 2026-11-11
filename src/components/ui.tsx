import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, type StyleProp, StyleSheet, Text,
  TextInput, type TextInputProps, type TextStyle, View, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { initials } from '@/lib/format';
import { avatarUrl } from '@/lib/supabase';
import { fonts, radius, space, useColors } from '@/lib/theme';
import type { Profile, RoundStatus } from '@/lib/types';

export type IconName = keyof typeof Ionicons.glyphMap;

export function Heading({ children, size = 26, style }: { children: ReactNode; size?: number; style?: StyleProp<TextStyle> }) {
  const c = useColors();
  return <Text style={[{ fontFamily: fonts.display, fontSize: size, color: c.ink, letterSpacing: -0.4 }, style]}>{children}</Text>;
}

export function Body({ children, muted, small, bold, style, numberOfLines }: {
  children: ReactNode; muted?: boolean; small?: boolean; bold?: boolean; style?: StyleProp<TextStyle>; numberOfLines?: number;
}) {
  const c = useColors();
  return (
    <Text numberOfLines={numberOfLines}
      style={[{ fontSize: small ? 13 : 16, lineHeight: small ? 18 : 22, color: muted ? c.muted : c.ink, fontWeight: bold ? '600' : '400' }, style]}>
      {children}
    </Text>
  );
}

/** Kleine Überschrift über einem Abschnitt */
export function SectionLabel({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const c = useColors();
  return <Text style={[{ fontSize: 13, fontWeight: '700', color: c.muted, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: space.s }, style]}>{children}</Text>;
}

type ButtonProps = {
  title: string; onPress: () => void; variant?: 'primary' | 'soft' | 'ghost' | 'danger' | 'sun'; icon?: IconName;
  loading?: boolean; disabled?: boolean; small?: boolean; style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, small, style }: ButtonProps) {
  const c = useColors();
  const bg = { primary: c.accent, soft: c.sunken, ghost: 'transparent', danger: 'transparent', sun: c.sun }[variant];
  const fg = { primary: c.onAccent, soft: c.ink, ghost: c.accent, danger: c.danger, sun: '#1E1B16' }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      hitSlop={small ? 8 : 0}
      style={({ pressed }) => [
        { backgroundColor: bg, minHeight: small ? 38 : 52, paddingHorizontal: small ? 14 : 20, borderRadius: radius.pill,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon && <Ionicons name={icon} size={small ? 17 : 20} color={fg} />}
          <Text style={{ color: fg, fontSize: small ? 14 : 16, fontWeight: '700' }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color, bg, size = 44 }: {
  icon: IconName; onPress: () => void; label: string; color?: string; bg?: string; size?: number;
}) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: bg ?? 'transparent', opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={color ?? c.ink} />
    </Pressable>
  );
}

export function Field({ label, hint, error, style, ...props }: TextInputProps & { label?: string; hint?: string; error?: string | null }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={{ fontSize: 14, fontWeight: '600', color: c.ink }}>{label}</Text>}
      <TextInput
        placeholderTextColor={c.muted}
        {...props}
        style={[{ minHeight: 52, borderRadius: radius.m, borderWidth: 1.5, borderColor: error ? c.danger : c.line, backgroundColor: c.card,
          paddingHorizontal: 16, paddingVertical: 12, fontSize: 17, color: c.ink }, style]}
      />
      {(error || hint) && <Text style={{ fontSize: 13, color: error ? c.danger : c.muted }}>{error || hint}</Text>}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const c = useColors();
  const base: ViewStyle = { backgroundColor: c.card, borderRadius: radius.l, padding: space.l, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return <Pressable onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}>{children}</Pressable>;
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }}
      style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: active ? c.ink : c.card, borderWidth: 1, borderColor: active ? c.ink : c.line }}>
      {icon && <Ionicons name={icon} size={16} color={active ? c.bg : c.ink} />}
      <Text style={{ color: active ? c.bg : c.ink, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.sunken, borderRadius: radius.m, padding: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={{ flex: 1, minHeight: 40, borderRadius: radius.m - 4, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.card : 'transparent' }}>
            <Text style={{ fontSize: 14, fontWeight: on ? '700' : '500', color: on ? c.ink : c.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Avatar({ profile, size = 40, ring, dimmed }: { profile: Profile; size?: number; ring?: string; dimmed?: boolean }) {
  const url = avatarUrl(profile.avatar_path);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: profile.color, alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', borderWidth: ring ? 2.5 : 0, borderColor: ring, opacity: dimmed ? 0.45 : 1 }}>
      {url ? <Image source={{ uri: url }} style={{ width: size, height: size }} contentFit="cover" transition={150} /> : (
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{initials(profile.display_name)}</Text>
      )}
    </View>
  );
}

export function AvatarStack({ profiles, size = 28, max = 5 }: { profiles: Profile[]; size?: number; max?: number }) {
  const c = useColors();
  const shown = profiles.slice(0, max);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((p, i) => (
        <View key={p.id || i} style={{ marginLeft: i === 0 ? 0 : -size * 0.3 }}>
          <Avatar profile={p} size={size} ring={c.card} />
        </View>
      ))}
      {profiles.length > max && <Text style={{ marginLeft: 6, color: c.muted, fontSize: 13, fontWeight: '600' }}>+{profiles.length - max}</Text>}
    </View>
  );
}

export function StatusPill({ status }: { status: RoundStatus }) {
  const c = useColors();
  const look = {
    geplant: { bg: c.sunSoft, fg: c.ink, label: 'Geplant' },
    aktiv: { bg: c.tealSoft, fg: c.teal, label: 'Läuft' },
    beendet: { bg: c.sunken, fg: c.muted, label: 'Beendet' },
  }[status];
  return (
    <View style={{ backgroundColor: look.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      {status === 'aktiv' && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.teal }} />}
      <Text style={{ color: look.fg, fontSize: 12, fontWeight: '700' }}>{look.label}</Text>
    </View>
  );
}

export function EmptyState({ icon, title, text, children }: { icon: IconName; title: string; text: string; children?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: space.xxl, paddingVertical: 48, gap: space.s }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.s }}>
        <Ionicons name={icon} size={32} color={c.accent} />
      </View>
      <Heading size={20} style={{ textAlign: 'center' }}>{title}</Heading>
      <Body muted style={{ textAlign: 'center' }}>{text}</Body>
      {children && <View style={{ marginTop: space.m, alignSelf: 'stretch', gap: space.s }}>{children}</View>}
    </View>
  );
}

/** Blatt, das von unten hereinfährt. Inhalt bleibt über der Tastatur sichtbar. */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={onClose} accessibilityLabel="Schließen" />
        <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%', paddingBottom: insets.bottom + space.l }}>
          <View style={{ alignItems: 'center', paddingTop: 10 }}>
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.line }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: space.xl, paddingRight: space.s, paddingTop: space.s }}>
            <Heading size={22}>{title}</Heading>
            <IconButton icon="close" onPress={onClose} label="Schließen" />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.xl, paddingTop: space.m, gap: space.l }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ListRow({ left, title, subtitle, right, onPress }: { left?: ReactNode; title: string; subtitle?: string; right?: ReactNode; onPress?: () => void }) {
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 56, paddingVertical: 8 }}>
      {left}
      <View style={{ flex: 1 }}>
        <Body bold numberOfLines={1}>{title}</Body>
        {subtitle ? <Body muted small numberOfLines={2}>{subtitle}</Body> : null}
      </View>
      {right}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>{inner}</Pressable> : inner;
}

export function Divider() {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line }} />;
}
