import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Body, Button, Card, Divider, Field, ListRow, SectionLabel } from '@/components/ui';
import { errorText } from '@/lib/format';
import { uploadAvatar } from '@/lib/media';
import { supabase } from '@/lib/supabase';
import { AVATAR_COLORS, space, useColors } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';

export default function ProfileScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, session, userId, saveProfile, signOut, blocked, unblock, deleteAccount } = useAuth();
  const [names, setNames] = useState<Record<string, string>>({});
  const [name, setName] = useState(profile?.display_name ?? '');
  const [busy, setBusy] = useState(false);

  // Namen der blockierten Personen (nur lesbar, solange man noch einen Hop teilt)
  const blockedKey = [...blocked].sort().join(',');
  useEffect(() => {
    if (!blockedKey) return;
    supabase.from('profiles').select('id, display_name').in('id', blockedKey.split(','))
      .then(({ data }) => setNames(Object.fromEntries((data ?? []).map((p) => [p.id as string, p.display_name as string]))));
  }, [blockedKey]);

  if (!session) return <Redirect href="/login" />;
  if (!profile || !userId) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Das hat nicht geklappt', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert('Konto endgültig löschen?', 'Dein Konto, dein Profil, deine Nachrichten, Fotos, Videos, Check-ins und dein Standort werden gelöscht. Hops, in denen nur du bist, verschwinden ganz. Ausgaben, an denen andere beteiligt sind, bleiben für deren Abrechnung ohne deinen Namen bestehen. Das lässt sich nicht rückgängig machen.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Weiter', style: 'destructive', onPress: () =>
        Alert.alert('Wirklich löschen?', `Das Konto ${session?.user.email ?? ''} wird jetzt gelöscht.`, [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Konto löschen', style: 'destructive', onPress: () => run(deleteAccount) },
        ]) },
    ]);

  const pickAvatar = () => run(async () => {
    const path = await uploadAvatar(userId);
    if (path) await saveProfile({ avatar_path: path });
  });

  return (
    <ScrollView style={{ backgroundColor: c.bg }} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: space.xl, paddingBottom: insets.bottom + space.xl, gap: space.xl }}>
      <View style={{ alignItems: 'center', gap: space.m }}>
        <Pressable onPress={pickAvatar} accessibilityRole="button" accessibilityLabel="Profilbild ändern">
          <Avatar profile={profile} size={112} />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: space.s }}>
          <Button small variant="soft" icon="image" title="Bild wählen" onPress={pickAvatar} />
          {profile.avatar_path && <Button small variant="ghost" title="Entfernen" onPress={() => run(() => saveProfile({ avatar_path: null }))} />}
        </View>
      </View>

      <View style={{ gap: space.m }}>
        <Field label="Name" value={name} onChangeText={setName} maxLength={40} hint="So erscheinst du auf der Karte und im Chat." />
        <Button title="Namen speichern" variant="soft" loading={busy} disabled={name.trim().length < 2 || name.trim() === profile.display_name}
          onPress={() => run(() => saveProfile({ display_name: name.trim() }))} />
      </View>

      <View>
        <SectionLabel>Deine Farbe</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.m }}>
          {AVATAR_COLORS.map((color) => (
            <Pressable key={color} onPress={() => run(() => saveProfile({ color }))} accessibilityRole="button" accessibilityLabel={`Farbe ${color}`}
              style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: color, borderWidth: profile.color === color ? 4 : 0, borderColor: c.ink }} />
          ))}
        </View>
      </View>

      {blocked.size > 0 && (
        <View>
          <SectionLabel>Blockierte Personen</SectionLabel>
          <Card style={{ paddingVertical: space.s }}>
            {[...blocked].map((id, i) => (
              <View key={id}>
                {i > 0 && <Divider />}
                <ListRow left={<Ionicons name="person-remove" size={22} color={c.muted} />} title={names[id] ?? 'Person aus einem früheren Hop'}
                  right={<Button small variant="soft" title="Aufheben" onPress={() => run(() => unblock(id))} />} />
              </View>
            ))}
          </Card>
        </View>
      )}

      <Card style={{ paddingVertical: space.s }}>
        <ListRow onPress={() => router.push('/legal')} left={<Ionicons name="shield-checkmark-outline" size={22} color={c.teal} />}
          title="Datenschutz & Nutzungsregeln" right={<Ionicons name="chevron-forward" size={20} color={c.muted} />} />
      </Card>

      <View style={{ gap: space.s }}>
        <Body muted small style={{ textAlign: 'center' }}>Angemeldet als {session?.user.email}</Body>
        <Button title="Abmelden" variant="soft" icon="log-out-outline" onPress={() => run(signOut)} />
        <Button title="Konto löschen" variant="danger" icon="trash-outline" loading={busy} onPress={confirmDelete} />
      </View>
    </ScrollView>
  );
}
