import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StatusBar, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MenuHost, showMenu } from '@/components/Menu';
import { Body, Button, Chip, EmptyState, IconButton, Sheet } from '@/components/ui';
import { errorText, formatTime } from '@/lib/format';
import { confirmBlock, reportContent } from '@/lib/moderation';
import { deleteMedia, pickFromLibrary, signedUrls, takeWithCamera, uploadToCollage } from '@/lib/media';
import { radius, softShadow, space, useColors } from '@/lib/theme';
import type { Media } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useRound } from '@/providers/RoundProvider';

const GAP = 4;

function useSigned(paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join('|');
  useEffect(() => {
    let alive = true;
    if (paths.length) signedUrls(paths).then((u) => alive && setUrls(u)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return urls;
}

function Tile({ m, url, size, height, onPress }: { m: Media; url?: string; size: number; height: number; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel={m.kind === 'video' ? 'Video öffnen' : 'Foto öffnen'}
      style={{ width: size, height, borderRadius: radius.s, overflow: 'hidden', backgroundColor: c.sunken }}>
      {url && <Image source={{ uri: url, cacheKey: m.thumb_path ?? m.storage_path }} style={{ width: size, height }} contentFit="cover" transition={200} recyclingKey={m.id} />}
      {m.kind === 'video' && (
        <View style={{ position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="play" size={12} color="#fff" />
          {m.duration_ms != null && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{Math.floor(m.duration_ms / 60000)}:{Math.floor((m.duration_ms % 60000) / 1000).toString().padStart(2, '0')}</Text>}
        </View>
      )}
    </Pressable>
  );
}

function VideoPage({ url, width, height }: { url: string; width: number; height: number }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={{ width, height }} contentFit="contain" nativeControls />;
}

export default function CollageTab() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { userId, block } = useAuth();
  const { round, media, stations, checkins, isOrganizer, profileOf } = useRound();
  const [filter, setFilter] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);
  const [sharing, setSharing] = useState(false);
  const pager = useRef<FlatList>(null);

  const shown = useMemo(() => (filter ? media.filter((m) => m.station_id === filter) : media), [media, filter]);
  const usedStations = useMemo(() => stations.filter((s) => media.some((m) => m.station_id === s.id)), [stations, media]);
  const thumbs = useSigned(shown.map((m) => m.thumb_path ?? m.storage_path));
  const full = useSigned(viewer != null && shown[current] ? [shown[current].storage_path] : []);

  // Mosaik: abwechselnd ein großes Bild mit zwei kleinen und eine Dreierreihe
  const unit = (width - space.s * 2 - GAP * 2) / 3;
  const rows = useMemo(() => {
    const out: { key: string; kind: 'links' | 'reihe' | 'rechts'; items: { m: Media; index: number }[] }[] = [];
    const kinds = ['links', 'reihe', 'rechts', 'reihe'] as const;
    for (let i = 0, r = 0; i < shown.length; i += 3, r++) {
      out.push({ key: shown[i].id, kind: kinds[r % 4], items: shown.slice(i, i + 3).map((m, j) => ({ m, index: i + j })) });
    }
    return out;
  }, [shown]);

  if (!round || !userId) return null;

  const upload = async (pick: () => Promise<import('expo-image-picker').ImagePickerAsset[]>) => {
    setAddOpen(false);
    try {
      const assets = await pick();
      if (!assets.length) return;
      const stationId = checkins.find((ch) => ch.user_id === userId && !ch.left_at)?.station_id ?? null;
      const failed: string[] = [];
      for (let i = 0; i < assets.length; i++) {
        setProgress({ done: i, total: assets.length });
        try {
          await uploadToCollage(round.id, userId, stationId, assets[i]);
        } catch (e) {
          failed.push(errorText(e));
        }
      }
      if (failed.length) Alert.alert(`${failed.length} von ${assets.length} nicht hochgeladen`, failed[0]);
    } catch (e) {
      Alert.alert('Das hat nicht geklappt', errorText(e));
    } finally {
      setProgress(null);
    }
  };

  const openViewer = (index: number) => {
    setCurrent(index);
    setViewer(index);
  };

  const item = viewer != null ? shown[current] : null;

  const share = async () => {
    if (!item || !full[item.storage_path]) return;
    setSharing(true);
    try {
      const target = new File(Paths.cache, item.storage_path.split('/').pop()!);
      if (target.exists) target.delete();
      const file = await File.downloadFileAsync(full[item.storage_path], target);
      await Sharing.shareAsync(file.uri);
    } catch (e) {
      Alert.alert('Das hat nicht geklappt', errorText(e));
    } finally {
      setSharing(false);
    }
  };

  const remove = () => {
    if (!item) return;
    Alert.alert(item.kind === 'video' ? 'Video löschen?' : 'Foto löschen?', 'Es verschwindet für alle aus der Collage.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => {
        try {
          await deleteMedia(item);
          setViewer(null);
        } catch (e) {
          Alert.alert('Das hat nicht geklappt', errorText(e));
        }
      } },
    ]);
  };

  const flag = () => {
    if (!item) return;
    const name = profileOf(item.user_id).display_name;
    showMenu({
      title: item.kind === 'video' ? `Video von ${name}` : `Foto von ${name}`,
      options: [
        { text: 'Melden', icon: 'flag-outline', onPress: () => reportContent({ roundId: round.id, kind: 'media', id: item.id, userId: item.user_id, excerpt: item.kind === 'video' ? 'Video in der Collage' : 'Foto in der Collage' }) },
        { text: 'Person blockieren', icon: 'person-remove-outline', onPress: () => confirmBlock(name, async () => { await block(item.user_id); setViewer(null); }) },
      ],
    });
  };

  const tile = (x: { m: Media; index: number } | undefined, w: number, h: number) =>
    x ? <Tile key={x.m.id} m={x.m} url={thumbs[x.m.thumb_path ?? x.m.storage_path]} size={w} height={h} onPress={() => openViewer(x.index)} /> : <View key="leer" style={{ width: w, height: h }} />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={{ paddingHorizontal: space.s, paddingBottom: 110, gap: GAP, flexGrow: 1 }}
        ListHeaderComponent={usedStations.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s, paddingVertical: space.m, paddingHorizontal: space.s }}>
            <Chip label={`Alle · ${media.length}`} active={filter === null} onPress={() => setFilter(null)} />
            {usedStations.map((s) => <Chip key={s.id} label={s.name} active={filter === s.id} onPress={() => setFilter(s.id)} />)}
          </ScrollView>
        ) : <View style={{ height: space.s }} />}
        ListEmptyComponent={<EmptyState icon="images" title="Eure Collage ist noch leer" text="Fotos und Videos sehen nur die Leute in diesem Hop." />}
        renderItem={({ item: row }) => {
          const [a, b, d] = row.items;
          const big = unit * 2 + GAP;
          if (row.kind === 'reihe' || row.items.length < 3) {
            return <View style={{ flexDirection: 'row', gap: GAP }}>{row.items.map((x) => tile(x, row.items.length === 3 ? unit : (width - space.s * 2 - GAP * (row.items.length - 1)) / row.items.length, row.items.length === 3 ? unit : unit * 1.4))}</View>;
          }
          const large = tile(row.kind === 'links' ? a : d, big, big);
          const small = (
            <View key="klein" style={{ gap: GAP }}>
              {tile(row.kind === 'links' ? b : a, unit, unit)}
              {tile(row.kind === 'links' ? d : b, unit, unit)}
            </View>
          );
          return <View style={{ flexDirection: 'row', gap: GAP }}>{row.kind === 'links' ? [large, small] : [small, large]}</View>;
        }}
      />

      {progress && (
        <View style={{ position: 'absolute', left: space.l, right: space.l, top: space.m, backgroundColor: c.ink, borderRadius: radius.m, padding: space.m, flexDirection: 'row', alignItems: 'center', gap: space.m }}>
          <ActivityIndicator color={c.bg} />
          <Text style={{ color: c.bg, fontWeight: '600', fontSize: 15 }}>Lade {progress.done + 1} von {progress.total} hoch …</Text>
        </View>
      )}

      <View style={{ position: 'absolute', right: space.l, bottom: space.l }}>
        <Button title="Hinzufügen" icon="camera" onPress={() => setAddOpen(true)} disabled={!!progress}
          style={{ paddingHorizontal: 26, ...softShadow(c, 2) }} />
      </View>

      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Zur Collage hinzufügen">
        <Button title="Aus der Mediathek" icon="images-outline" onPress={() => upload(pickFromLibrary)} />
        <Button title="Foto aufnehmen" variant="soft" icon="camera-outline" onPress={() => upload(() => takeWithCamera(false))} />
        <Button title="Video aufnehmen" variant="soft" icon="videocam-outline" onPress={() => upload(() => takeWithCamera(true))} />
        <Body muted small>Videos bis 90 Sekunden und 50 MB. Sichtbar nur für die Mitglieder dieses Hops.</Body>
      </Sheet>

      <Modal visible={viewer != null} animationType="fade" onRequestClose={() => setViewer(null)} statusBarTranslucent>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <FlatList
            ref={pager}
            data={shown}
            horizontal
            pagingEnabled
            keyExtractor={(m) => m.id}
            initialScrollIndex={viewer ?? 0}
            getItemLayout={(_d, index) => ({ length: width, offset: width * index, index })}
            showsHorizontalScrollIndicator={false}
            windowSize={3}
            onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item: m, index }) => {
              const url = index === current ? full[m.storage_path] : undefined;
              const thumb = thumbs[m.thumb_path ?? m.storage_path];
              return (
                <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
                  {m.kind === 'video' && url ? <VideoPage url={url} width={width} height={height - insets.top - insets.bottom - 120} /> : (
                    <Image source={{ uri: (m.kind === 'photo' && url) || thumb, cacheKey: m.kind === 'photo' && url ? m.storage_path : `${m.thumb_path ?? m.storage_path}` }}
                      style={{ width, height }} contentFit="contain" placeholder={thumb ? { uri: thumb, cacheKey: m.thumb_path ?? m.storage_path } : undefined} placeholderContentFit="contain" />
                  )}
                </View>
              );
            }}
          />
          <View style={{ position: 'absolute', top: insets.top + 4, left: space.s, right: space.s, flexDirection: 'row', alignItems: 'center', gap: space.s }}>
            <IconButton icon="close" label="Schließen" color="#fff" bg="rgba(0,0,0,0.45)" onPress={() => setViewer(null)} />
            {item && (
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }} numberOfLines={1}>{profileOf(item.user_id).display_name}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }} numberOfLines={1}>
                  {[formatTime(item.created_at), stations.find((s) => s.id === item.station_id)?.name].filter(Boolean).join(' · ')}
                </Text>
              </View>
            )}
          </View>
          {item && (
            <View style={{ position: 'absolute', bottom: insets.bottom + space.m, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: space.xl }}>
              {sharing ? <View style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#fff" /></View>
                : <IconButton icon="share-outline" label="Teilen oder sichern" color="#fff" bg="rgba(255,255,255,0.18)" size={52} onPress={share} />}
              {item.user_id !== userId && <IconButton icon="flag-outline" label="Melden oder blockieren" color="#fff" bg="rgba(255,255,255,0.18)" size={52} onPress={flag} />}
              {(item.user_id === userId || isOrganizer) && <IconButton icon="trash-outline" label="Löschen" color="#fff" bg="rgba(255,255,255,0.18)" size={52} onPress={remove} />}
            </View>
          )}
        </View>
        {/* eigener Menü-Host: Das Vollbild liegt über dem der App */}
        <MenuHost />
      </Modal>
    </View>
  );
}
