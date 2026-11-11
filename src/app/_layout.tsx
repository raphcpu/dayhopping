import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold, useFonts } from '@expo-google-fonts/bricolage-grotesque';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MenuHost } from '@/components/Menu';
import { onPushTap } from '@/lib/push';
import { fonts, useColors } from '@/lib/theme';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';

SplashScreen.preventAutoHideAsync().catch(() => {});

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
      <Stack.Screen name="round/[id]" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });
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
