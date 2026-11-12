import { Pressable, ScrollView, Text, View } from 'react-native';

// Bewusst ohne eigene Schriften, Theme oder Kontext: muss auch funktionieren, wenn sonst nichts geht.
export function CrashScreen({ message, stack, onRetry }: { message: string; stack?: string; onRetry?: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#F3F4F7', paddingTop: 72, paddingHorizontal: 24 }}>
      <Text style={{ fontSize: 26, fontWeight: '800', color: '#151821' }}>Da ist etwas schiefgelaufen</Text>
      <Text style={{ fontSize: 16, color: '#667085', marginTop: 8, lineHeight: 22 }}>
        Der Fehler wurde automatisch gemeldet. Ein Screenshot dieser Seite hilft trotzdem bei der Suche.
      </Text>
      <ScrollView style={{ flex: 1, marginTop: 20, marginBottom: 16, backgroundColor: '#E9EBF0', borderRadius: 12 }} contentContainerStyle={{ padding: 14 }}>
        <Text selectable style={{ fontSize: 14, fontWeight: '700', color: '#C62F2F' }}>{message}</Text>
        {stack ? <Text selectable style={{ fontSize: 11, color: '#151821', marginTop: 10, fontFamily: 'monospace' }}>{stack.slice(0, 3000)}</Text> : null}
      </ScrollView>
      {onRetry && (
        <Pressable onPress={onRetry} style={{ backgroundColor: '#5B3DF5', borderRadius: 999, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 40 }}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Erneut versuchen</Text>
        </Pressable>
      )}
    </View>
  );
}
