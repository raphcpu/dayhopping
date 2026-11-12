import { Ionicons } from '@expo/vector-icons';
import { createElement } from 'react';
import { Pressable, Text, View } from 'react-native';
import { toDay } from '@/lib/format';
import { radius, useColors } from '@/lib/theme';

type Props = {
  label: string; mode: 'date' | 'time'; value: Date | null; onChange: (d: Date | null) => void;
  placeholder?: string; clearable?: boolean; fallback?: Date;
};

const pad = (n: number) => n.toString().padStart(2, '0');

/** Web: Datums- und Zeitauswahl des Browsers (auf dem iPhone das Auswahlrad von iOS). */
export function DateField({ label, mode, value, onChange, clearable }: Props) {
  const c = useColors();
  const str = value ? (mode === 'date' ? toDay(value) : `${pad(value.getHours())}:${pad(value.getMinutes())}`) : '';
  const input = createElement('input', {
    type: mode,
    value: str,
    'aria-label': label,
    onChange: (e: { target: { value: string } }) => {
      const v = e.target.value;
      if (!v) return onChange(null);
      if (mode === 'date') {
        const [y, m, d] = v.split('-').map(Number);
        onChange(new Date(y, m - 1, d));
      } else {
        const [h, min] = v.split(':').map(Number);
        const d = new Date(value ?? new Date());
        d.setHours(h, min, 0, 0);
        onChange(d);
      }
    },
    style: { flex: 1, minHeight: 50, border: 'none', outline: 'none', background: 'transparent', fontSize: 17, color: c.ink, fontFamily: 'inherit' },
  });
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: c.muted, marginLeft: 2 }}>{label}</Text>
      <View style={{ minHeight: 54, borderRadius: radius.m, backgroundColor: c.sunken, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name={mode === 'date' ? 'calendar-outline' : 'time-outline'} size={20} color={c.muted} />
        {input}
        {clearable && value && (
          <Pressable onPress={() => onChange(null)} hitSlop={12} accessibilityLabel="Zurücksetzen">
            <Ionicons name="close-circle" size={22} color={c.muted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}
