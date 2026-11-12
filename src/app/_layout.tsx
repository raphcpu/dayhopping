import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold, useFonts } from '@expo-google-fonts/bricolage-grotesque';
import { type ErrorBoundaryProps, useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { CrashScreen } from '@/components/CrashScreen';
import { MenuHost } from '@/components/Menu';
import { type CrashInfo, onFatal, reportError } from '@/lib/crash';
import { onPushTap } from '@/lib/push';
import { fonts, useColors } from '@/lib/theme';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Fehler beim Zeichnen einer Seite: melden und anzeigen statt abstürzen
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error, true, 'render');
    SplashScreen.hideAsync().catch(() => {});
  }, [error]);
  return <CrashScreen message={`${error.name}: ${error.message}`} stack={error.stack} onRetry={retry} />;
}

function Screens() {
  const c = useColors();
  const { loading, session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  // Tippen auf eine Push-Nachricht führt direkt in den passenden Tab
  useEffect(() => {
    if (!session) return;
    return onPushTap((data) => {
      if (!data.roundId) return;
      const tab = data.type === 'expense' ? '/kosten' : data.type === 'report' ? '/dashboard' : data.type === 'status' ? '' : '/chat';
      router.push(`/round/${data.roundId}${tab}`);
    });
  }, [session, router]);

  if (loading) return null;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerShadowVisible: false,
        headerTintColor: c.ink,
        headerTitleStyle: { fontFamily: fonts.display, fontSize: 19 },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: c.bg },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="profile" options={{ title: 'Profil' }} />
      <Stack.Screen name="legal" options={{ title: 'Datenschutz & Regeln' }} />
      <Stack.Screen name="kartentest" options={{ title: 'Kartentest' }} />
      <Stack.Screen name="round/[id]" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });
  const [crash, setCrash] = useState<CrashInfo | null>(null);
  useEffect(() => onFatal((c) => {
    setCrash(c);
    SplashScreen.hideAsync().catch(() => {});
  }), []);
  if (crash) return <CrashScreen message={crash.message} stack={crash.stack} />;
  if (!fontsLoaded && !fontError) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <StatusBar style="auto" />
        <Screens />
        <MenuHost />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
