import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Heading } from '@/components/ui';
import { LEGAL_VERSION, operatorComplete, privacySections, rulesSections } from '@/lib/legal';
import { space, useColors } from '@/lib/theme';

export default function LegalScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: space.xl, paddingBottom: insets.bottom + space.xxl, gap: space.xl }}>
      <View style={{ gap: space.xs }}>
        <Heading size={28}>Datenschutz</Heading>
        <Body muted small>{LEGAL_VERSION}</Body>
      </View>
      {!operatorComplete && (
        <View style={{ backgroundColor: c.sunSoft, borderRadius: 16, padding: space.l }}>
          <Body small>Die Angaben zum Betreiber sind noch nicht eingetragen (EXPO_PUBLIC_LEGAL_NAME, _ADDRESS und _EMAIL in .env).</Body>
        </View>
      )}
      {[...privacySections(), ...rulesSections()].map((s) => (
        <View key={s.title} style={{ gap: space.s }}>
          <Heading size={19}>{s.title}</Heading>
          {s.paragraphs.map((p, i) => <Body key={i}>{p}</Body>)}
        </View>
      ))}
    </ScrollView>
  );
}
