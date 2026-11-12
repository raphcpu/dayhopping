import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Field, Segmented } from '@/components/ui';
import { errorText } from '@/lib/format';
import { isConfigured } from '@/lib/supabase';
import { BRAND, fonts, space, useColors } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';

export default function Login() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (session) return <Redirect href="/" />;

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (mode === 'register' && name.trim().length < 2) return setError('Bitte gib deinen Namen ein.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Bitte gib eine gültige E-Mail-Adresse ein.');
    if (password.length < 6) return setError('Das Passwort braucht mindestens 6 Zeichen.');
    setBusy(true);
    try {
      if (mode === 'login') await signIn(email, password);
      else if (await signUp(name, email, password)) {
        setInfo('Fast geschafft: Bestätige den Link in der E-Mail, die wir dir geschickt haben, und melde dich dann an.');
        setMode('login');
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#151821' }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
        <View style={{ paddingTop: insets.top + 56, paddingHorizontal: space.xl, paddingBottom: 40 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
            <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 56, color: '#fff', letterSpacing: -2.2, lineHeight: 58 }}>Day{'\n'}Hop</Text>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: BRAND, marginBottom: 14 }} />
          </View>
          <Text style={{ color: '#C9CEDA', fontSize: 18, marginTop: space.m, lineHeight: 25 }}>
            Ein Tag, viele Stationen,{'\n'}alle zusammen.
          </Text>
        </View>
        <View style={{ flex: 1, backgroundColor: c.bg, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: space.xl, paddingBottom: insets.bottom + space.xl, gap: space.l }}>
          {!isConfigured && (
            <View style={{ backgroundColor: c.sunSoft, padding: space.l, borderRadius: 16 }}>
              <Body small>Supabase ist noch nicht eingerichtet. Trage EXPO_PUBLIC_SUPABASE_URL und EXPO_PUBLIC_SUPABASE_ANON_KEY in die Datei .env ein (siehe README).</Body>
            </View>
          )}
          <Segmented value={mode} onChange={(m) => { setMode(m); setError(null); }}
            options={[{ value: 'login', label: 'Anmelden' }, { value: 'register', label: 'Neu hier' }]} />
          {mode === 'register' && (
            <Field label="Dein Name" value={name} onChangeText={setName} placeholder="So sieht dich deine Gruppe" autoCapitalize="words"
              textContentType="name" maxLength={40} returnKeyType="next" />
          )}
          <Field label="E-Mail" value={email} onChangeText={setEmail} placeholder="du@beispiel.de" autoCapitalize="none" autoCorrect={false}
            keyboardType="email-address" textContentType="emailAddress" autoComplete="email" returnKeyType="next" />
          <Field label="Passwort" value={password} onChangeText={setPassword} placeholder="Mindestens 6 Zeichen" secureTextEntry
            textContentType={mode === 'login' ? 'password' : 'newPassword'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            returnKeyType="go" onSubmitEditing={submit} />
          {error && <Body style={{ color: c.danger }}>{error}</Body>}
          {info && <Body style={{ color: c.teal }}>{info}</Body>}
          <Button title={mode === 'login' ? 'Anmelden' : 'Konto erstellen'} onPress={submit} loading={busy} />
          <Body muted small style={{ textAlign: 'center' }}>
            {mode === 'register' ? 'Mit dem Erstellen des Kontos akzeptierst du die ' : 'Hier findest du die '}
            <Text onPress={() => router.push('/legal')} accessibilityRole="link" style={{ color: c.accent, fontWeight: '700' }}>Datenschutzerklärung und Nutzungsregeln</Text>.
          </Body>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
