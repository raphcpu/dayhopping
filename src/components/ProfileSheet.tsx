import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StatusBar, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatAgo, formatDuration } from '@/lib/format';
import { confirmBlock } from '@/lib/moderation';
import { memberStats } from '@/lib/stats';
import { avatarUrl } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useRound } from '@/providers/RoundProvider';
import { Avatar, Body, Button, Heading, IconButton, Sheet } from './ui';

type Options = { onShowOnMap?: () => void };
type Open = { userId: string; options: Options };

// Der zuletzt eingehängte Host zeigt das Profil.
const hosts: ((o: Open) => void)[] = [];

/** Öffnet das Profil einer Person aus dem aktuellen Hop. */
export function showProfile(userId: string, options: Options = {}) {
  hosts[hosts.length - 1]?.({ userId, options });
}

export function ProfileHost() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { userId: me, block } = useAuth();
  const { round, members, stations, checkins, locations, profileOf } = useRound();
  const [open, setOpen] = useState<Open | null>(null);
  const [visible, setVisible] = useState(false);
  const [fullImage, setFullImage] = useState(false);

  useEffect(() => {
    const show = (o: Open) => {
      setOpen(o);
      setVisible(true);
    };
    hosts.push(show);
    return () => {
      hosts.splice(hosts.indexOf(show), 1);
    };
  }, []);

  const uid = open?.userId ?? null;
  const p = profileOf(uid);
  const member = members.find((m) => m.user_id === uid);
  const st = uid && member ? memberStats([member], checkins)[0] : null;
  const loc = locations.find((l) => l.user_id === uid);
  const here = st?.currentStationId ? stations.find((s) => s.id === st.currentStationId)?.name : null;
  const url = avatarUrl(p.avatar_path);
  const mine = uid === me;

  const status = !member
    ? 'Nicht mehr in diesem Hop'
    : round?.status !== 'aktiv'
      ? round?.status === 'geplant' ? 'Der Hop hat noch nicht begonnen' : 'Der Hop ist beendet'
      : here
        ? `Gerade in: ${here}`
        : !member.sharing
          ? 'Teilt gerade keinen Standort'
          : loc
            ? `Unterwegs · Standort ${formatAgo(loc.recorded_at)}`
            : 'Noch kein Standort';

  const close = (then?: () => void) => {
    setVisible(false);
    if (then) setTimeout(then, 350);
  };

  return (
    <>
      <Sheet visible={visible} onClose={() => close()} title={mine ? 'Dein Profil' : 'Profil'}>
        <View style={{ alignItems: 'center', gap: space.m }}>
          <Pressable onPress={() => url && setFullImage(true)} disabled={!url} accessibilityRole="imagebutton"
            accessibilityLabel={url ? `Profilbild von ${p.display_name} groß anzeigen` : undefined}>
            <Avatar profile={p} size={168} />
            {url && (
              <View style={{ position: 'absolute', right: 6, bottom: 6, width: 36, height: 36, borderRadius: 18, backgroundColor: c.card,
                alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.line }}>
                <Ionicons name="expand" size={18} color={c.ink} />
              </View>
            )}
          </Pressable>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Heading size={26}>{p.display_name}</Heading>
              {member?.role === 'organizer' && <Ionicons name="star" size={20} color={c.accent} accessibilityLabel="Organisation" />}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: p.color }} />
              <Body muted>{member?.role === 'organizer' ? 'Organisation' : 'Mitglied'}</Body>
            </View>
          </View>
        </View>

        <View style={{ backgroundColor: c.card, borderRadius: radius.m, borderWidth: 1, borderColor: c.line, padding: space.l, gap: space.s }}>
          <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'center' }}>
            <Ionicons name={here ? 'location' : 'navigate-outline'} size={20} color={here ? c.teal : c.muted} />
            <Body style={{ flex: 1 }}>{status}</Body>
          </View>
          {st && (
            <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'center' }}>
              <Ionicons name="flag-outline" size={20} color={c.muted} />
              <Body style={{ flex: 1 }}>
                {st.visited} von {stations.length} Stationen besucht{st.totalStayMs > 60_000 ? ` · ${formatDuration(st.totalStayMs)} vor Ort` : ''}
              </Body>
            </View>
          )}
        </View>

        {open?.options.onShowOnMap && loc && (
          <Button title="Auf der Karte zeigen" icon="locate" onPress={() => close(open.options.onShowOnMap)} />
        )}
        {!mine && uid && member && (
          <Button title="Person blockieren" variant="danger" icon="person-remove-outline"
            onPress={() => close(() => confirmBlock(p.display_name, () => block(uid)))} />
        )}
      </Sheet>

      <Modal visible={fullImage} animationType="fade" onRequestClose={() => setFullImage(false)} statusBarTranslucent>
        <StatusBar barStyle="light-content" />
        <Pressable style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }} onPress={() => setFullImage(false)}>
          {url && <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit="contain" transition={150} />}
        </Pressable>
        <View style={{ position: 'absolute', top: insets.top + 4, left: space.s }}>
          <IconButton icon="close" label="Schließen" color="#fff" bg="rgba(0,0,0,0.45)" onPress={() => setFullImage(false)} />
        </View>
      </Modal>
    </>
  );
}
