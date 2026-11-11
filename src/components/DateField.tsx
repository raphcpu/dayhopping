import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { formatDay, formatTime } from '@/lib/format';
import { radius, useColors } from '@/lib/theme';
import { Button, Sheet } from './ui';

type Props = {
  label: string; mode: 'date' | 'time'; value: Date | null; onChange: (d: Date | null) => void;
  placeholder?: string; clearable?: boolean; fallback?: Date;
};

/** Datum oder Uhrzeit mit dem Auswahlrad bzw. Dialog des Systems. */
export function DateField({ label, mode, value, onChange, placeholder = 'Auswählen', clearable, fallback }: Props) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(value ?? fallback ?? new Date());

  const show = () => {
    const start = value ?? fallback ?? new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: start, mode, is24Hour: true, onChange: (e, d) => e.type === 'set' && d && onChange(d) });
    } else {
      setDraft(start);
      setOpen(true);
    }
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: c.ink }}>{label}</Text>
      <Pressable onPress={show} accessibilityRole="button"
        style={{ minHeight: 52, borderRadius: radius.m, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.card, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name={mode === 'date' ? 'calendar-outline' : 'time-outline'} size={20} color={c.muted} />
        <Text style={{ flex: 1, fontSize: 17, color: value ? c.ink : c.muted }}>
          {value ? (mode === 'date' ? formatDay(value) : `${formatTime(value)} Uhr`) : placeholder}
        </Text>
        {clearable && value && (
          <Pressable onPress={() => onChange(null)} hitSlop={12} accessibilityLabel="Zurücksetzen">
            <Ionicons name="close-circle" size={22} color={c.muted} />
          </Pressable>
        )}
      </Pressable>
      {Platform.OS === 'ios' && (
        <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
          <DateTimePicker value={draft} mode={mode} display={mode === 'date' ? 'inline' : 'spinner'} locale="de-DE" is24Hour
            onChange={(_e, d) => d && setDraft(d)} accentColor={c.accent} />
          <Button title="Übernehmen" onPress={() => { onChange(draft); setOpen(false); }} />
        </Sheet>
      )}
    </View>
  );
}
