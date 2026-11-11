import { Pressable, ScrollView, Text, View } from 'react-native';

// Bewusst ohne eigene Schriften, Theme oder Kontext: muss auch funktionieren, wenn sonst nichts geht.
export function CrashScreen({ message, stack, onRetry }: { message: string; stack?: string; onRetry?: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#FBF6EE', paddingTop: 72, paddingHorizontal: 24 }}>
      <Text style={{ fontSize: 26, fontWeight: '800', color: '#1E1B16' }}>Da ist etwas schiefgelaufen</Text>
      <Text style={{ fontSize: 16, color: '#7B7265', marginTop: 8, lineHeight: 22 }}>
        Der Fehler wurde automatisch gemeldet. Ein Screenshot dieser Seite hilft trotzdem bei der Suche.
      </Text>
      <ScrollView style={{ flex: 1, marginTop: 20, marginBottom: 16, backgroundColor: '#F2EADD', borderRadius: 12 }} contentContainerStyle={{ padding: 14 }}>
        <Text selectable style={{ fontSize: 14, fontWeight: '700', color: '#C62F2F' }}>{message}</Text>
        {stack ? <Text selectable style={{ fontSize: 11, color: '#1E1B16', marginTop: 10, fontFamily: 'monospace' }}>{stack.slice(0, 3000)}</Text> : null}
      </ScrollView>
      {onRetry && (
        <Pressable onPress={onRetry} style={{ backgroundColor: '#FF5A36', borderRadius: 999, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 40 }}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Erneut versuchen</Text>
        </Pressable>
      )}
    </View>
  );
}
