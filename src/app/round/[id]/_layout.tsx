import { Redirect, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, EmptyState } from '@/components/ui';
import { CheckinCelebration } from '@/components/CheckinCelebration';
import { ProfileHost } from '@/components/ProfileSheet';
import { fonts, useColors } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { RoundProvider, useRound } from '@/providers/RoundProvider';

function RoundStack() {
  const c = useColors();
  const { loading, loadError, gone, round, isOrganizer, reload } = useRound();
  const [retrying, setRetrying] = useState(false);
  if (gone) return <Redirect href="/" />;
  if (loadError && !round) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <EmptyState icon="cloud-offline-outline" title="Keine Verbindung" text="Der Hop konnte nicht geladen werden. Prüf dein Internet und versuch es noch einmal.">
          <Button title="Erneut versuchen" icon="refresh" loading={retrying} onPress={async () => { setRetrying(true); await reload(); setRetrying(false); }} />
        </EmptyState>
      </View>
    );
  }
  if (loading || !round) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        <ActivityIndicator color={c.accent} size="large" />
      </View>
    );
  }
  return (
    <>
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerShadowVisible: false,
        headerTintColor: c.ink,
        headerTitleStyle: { fontFamily: fonts.display, fontSize: 19 },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: c.bg },
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="dashboard" options={{ title: isOrganizer ? 'Organisation' : 'Hop-Info' }} />
      <Stack.Screen name="station" options={{ title: 'Station', presentation: 'modal' }} />
      <Stack.Screen name="expense" options={{ title: 'Ausgabe', presentation: 'modal' }} />
    </Stack>
    <CheckinCelebration />
    <ProfileHost />
    </>
  );
}

export default function RoundLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  if (!session) return <Redirect href="/login" />;
  return (
    <RoundProvider key={id} roundId={id}>
      <RoundStack />
    </RoundProvider>
  );
}
