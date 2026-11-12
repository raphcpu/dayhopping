import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showMenu } from '@/components/Menu';
import { showProfile } from '@/components/ProfileSheet';
import { Avatar, Body, EmptyState } from '@/components/ui';
import { errorText, formatTime } from '@/lib/format';
import { confirmBlock, reportContent } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';
import type { Message } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useRound } from '@/providers/RoundProvider';

export default function ChatTab() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { userId, block } = useAuth();
  const { round, messages, isOrganizer, profileOf, markRead } = useRound();
  const [text, setText] = useState('');
  const [announce, setAnnounce] = useState(false);
  const [sending, setSending] = useState(false);

  // Als gelesen markieren, solange der Tab offen ist
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    markRead();
    return () => {
      focused.current = false;
      markRead();
    };
  }, [markRead]));
  useEffect(() => {
    if (focused.current) markRead();
  }, [messages.length, markRead]);

  if (!round || !userId) return null;

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const { error } = await supabase.from('messages').insert({ round_id: round.id, user_id: userId, body, kind: announce ? 'announcement' : 'chat' });
    setSending(false);
    if (error) return Alert.alert('Nicht gesendet', errorText(error));
    setText('');
    setAnnounce(false);
  };

  // Eigene Nachrichten: löschen. Fremde: melden, blockieren; die Organisation darf auch löschen.
  const onLongPress = (m: Message) => {
    if (m.kind === 'system') return;
    const mine = m.user_id === userId;
    const excerpt = m.body.length > 80 ? `${m.body.slice(0, 80)}…` : m.body;
    const remove = async () => {
      const { error } = await supabase.from('messages').delete().eq('id', m.id);
      if (error) Alert.alert('Das hat nicht geklappt', errorText(error));
    };
    if (mine) return Alert.alert('Nachricht löschen?', excerpt, [{ text: 'Abbrechen', style: 'cancel' }, { text: 'Löschen', style: 'destructive', onPress: remove }]);
    const author = m.user_id;
    showMenu({
      title: profileOf(author).display_name,
      message: excerpt,
      options: [
        { text: 'Melden', icon: 'flag-outline', onPress: () => reportContent({ roundId: round.id, kind: 'message', id: m.id, userId: author, excerpt: m.body }) },
        ...(author ? [{ text: 'Person blockieren', icon: 'person-remove-outline' as const, onPress: () => confirmBlock(profileOf(author).display_name, () => block(author)) }] : []),
        ...(isOrganizer ? [{ text: 'Nachricht löschen', icon: 'trash-outline' as const, destructive: true, onPress: remove }] : []),
      ],
    });
  };

  const renderItem = ({ item: m, index }: { item: Message; index: number }) => {
    if (m.kind === 'system') {
      return (
        <View style={{ alignItems: 'center', paddingVertical: 6 }}>
          <Text style={{ color: c.muted, fontSize: 13 }}>{m.body} · {formatTime(m.created_at)}</Text>
        </View>
      );
    }
    const p = profileOf(m.user_id);
    if (m.kind === 'announcement') {
      return (
        <Pressable onLongPress={() => onLongPress(m)} style={{ backgroundColor: c.sun, borderRadius: radius.m, padding: space.l, marginVertical: 6, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="megaphone" size={16} color="#1E1B16" />
            <Text style={{ color: '#1E1B16', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 }}>DURCHSAGE VON {p.display_name.toUpperCase()} · {formatTime(m.created_at)}</Text>
          </View>
          <Text style={{ color: '#1E1B16', fontSize: 17, lineHeight: 23, fontWeight: '500' }}>{m.body}</Text>
        </Pressable>
      );
    }
    const mine = m.user_id === userId;
    // Liste ist umgedreht: index + 1 ist die ältere Nachricht darüber
    const above = messages[index + 1];
    const startsGroup = !above || above.kind !== 'chat' || above.user_id !== m.user_id;
    return (
      <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8, marginTop: startsGroup ? 10 : 2 }}>
        {!mine && (startsGroup && m.user_id ? (
          <Pressable onPress={() => showProfile(m.user_id!)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Profil von ${p.display_name}`}>
            <Avatar profile={p} size={30} />
          </Pressable>
        ) : <View style={{ width: 30 }} />)}
        <Pressable onLongPress={() => onLongPress(m)} delayLongPress={350}
          style={{ maxWidth: '78%', backgroundColor: mine ? c.bubbleMine : c.bubbleOther, borderRadius: 20, borderBottomRightRadius: mine ? 6 : 20, borderBottomLeftRadius: mine ? 20 : 6,
            paddingHorizontal: 14, paddingVertical: 9 }}>
          {!mine && startsGroup && <Text style={{ color: p.color, fontWeight: '700', fontSize: 13, marginBottom: 2 }}>{p.display_name}</Text>}
          <Text style={{ color: mine ? '#fff' : c.ink, fontSize: 16, lineHeight: 22 }}>{m.body}</Text>
          <Text style={{ color: mine ? 'rgba(255,255,255,0.75)' : c.muted, fontSize: 11, alignSelf: 'flex-end', marginTop: 2 }}>{formatTime(m.created_at)}</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.sunken }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 54}>
      <FlatList
        data={messages}
        inverted={messages.length > 0}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.m, paddingVertical: space.m, flexGrow: 1 }}
        ListEmptyComponent={<EmptyState icon="chatbubbles" title="Noch ist es still" text="Schreib die erste Nachricht an deine Gruppe." />}
      />
      <View style={{ backgroundColor: announce ? c.sunSoft : c.bg, borderTopWidth: 1, borderTopColor: announce ? c.sun : c.line, paddingHorizontal: space.s, paddingVertical: space.s, gap: 6 }}>
        {announce && <Body small bold style={{ paddingHorizontal: space.s }}>Durchsage: geht als Push an alle, auch an stummgeschaltete.</Body>}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
          {isOrganizer && (
            <Pressable onPress={() => setAnnounce((a) => !a)} accessibilityRole="button" accessibilityLabel="Als Durchsage senden" accessibilityState={{ selected: announce }}
              style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: announce ? c.sun : c.sunken }}>
              <Ionicons name="megaphone" size={22} color={announce ? '#1E1B16' : c.muted} />
            </Pressable>
          )}
          <TextInput value={text} onChangeText={setText} placeholder={announce ? 'Durchsage an alle …' : 'Nachricht'} placeholderTextColor={c.muted} multiline maxLength={2000}
            style={{ flex: 1, minHeight: 46, maxHeight: 130, backgroundColor: c.card, borderRadius: 23, borderWidth: 1, borderColor: c.line, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 16, color: c.ink }} />
          <Pressable onPress={send} disabled={!text.trim() || sending} accessibilityRole="button" accessibilityLabel="Senden"
            style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent, opacity: !text.trim() || sending ? 0.4 : 1 }}>
            <Ionicons name="arrow-up" size={24} color="#fff" />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
