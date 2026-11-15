import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Heading } from '@/components/ui';
import { errorText } from '@/lib/format';
import { rememberInvite } from '@/lib/invite';
import { supabase } from '@/lib/supabase';
import { space, useColors } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';

/** Ziel des QR-Codes/Einladungslinks: tritt dem Hop bei und öffnet ihn. */
export default function Join() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { loading, session } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const valid = typeof code === 'string' && /^[A-Za-z0-9]{6}$/.test(code);

  useEffect(() => {
    if (loading || !valid) return;
    if (!session) {
      rememberInvite(code);
      return;
    }
    let cancelled = false;
    supabase.rpc('join_round', { p_code: code }).then(({ data, error: e }) => {
      if (cancelled) return;
      if (e) setError(errorText(e));
      else router.replace(`/round/${data}`);
    });
    return () => {
      cancelled = true;
    };
  }, [loading, session, code, valid, router]);

  // Android-Handy im Browser: Wer die App hat, soll lieber dort beitreten
  const androidWeb = Platform.OS === 'web' && typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  const [inBrowser, setInBrowser] = useState(false);

  if (!loading && !session && valid && androidWeb && !inBrowser) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.l }}>
        <Heading size={24} style={{ textAlign: 'center' }}>Einladung zu DayHop</Heading>
        <Body muted style={{ textAlign: 'center' }}>Hast du die DayHop-App installiert? Dann tritt dort bei – sonst geht es auch hier im Browser.</Body>
        <Button title="In der App öffnen" icon="open-outline" onPress={() => Linking.openURL(`dayhop://join/${code}`)} style={{ alignSelf: 'stretch' }} />
        <Button title="Im Browser weiter" variant="soft" onPress={() => setInBrowser(true)} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  // Noch nicht angemeldet: erst anmelden/registrieren, danach geht es automatisch weiter
  if (!loading && !session && valid) return <Redirect href="/login" />;

  const problem = !valid ? 'Dieser Einladungslink ist unvollständig.' : error;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl, paddingTop: insets.top + space.xl, gap: space.l }}>
      {problem ? (
        <>
          <Ionicons name="alert-circle-outline" size={48} color={c.muted} />
          <Heading size={22} style={{ textAlign: 'center' }}>Beitreten hat nicht geklappt</Heading>
          <Body muted style={{ textAlign: 'center' }}>{problem}</Body>
          <Button title="Zu deinen Hops" onPress={() => router.replace('/')} />
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={c.accent} />
          <Body muted>Du wirst zum Hop hinzugefügt …</Body>
        </>
      )}
    </View>
  );
}
