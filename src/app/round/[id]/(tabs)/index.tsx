import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, FlatList, Image, Linking, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, Text, View } from 'react-native';
import MapView, { Circle, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { MapMissing } from '@/components/MapMissing';
import { StationGlow } from '@/components/StationGlow';
import { TrackingSheet } from '@/components/TrackingSheet';
import { Avatar, AvatarStack, Body, Button, Card, Heading, IconButton } from '@/components/ui';
import { useBatteryOptimized } from '@/lib/battery';
import { mapsConfigured } from '@/lib/config';
import { glowLevel, stationColor, withAlpha } from '@/lib/stationColors';
import { storage } from '@/lib/storage';
import { errorText, formatAgo, formatTime, initials } from '@/lib/format';
import { stationStats } from '@/lib/stats';
import { avatarUrl, supabase } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';
import type { Profile } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useRound } from '@/providers/RoundProvider';

const CARD_GAP = 10;
const CARD_WIDTH = Math.min(Dimensions.get('window').width - 56, 420);
const STALE_MS = 5 * 60_000;

/** Avatar als Kartenmarker. Zeichnet nur neu, bis das Bild geladen ist (schont den Akku). */
function usePersonMarker({ profile, stale, mine }: { profile: Profile; stale: boolean; mine: boolean }) {
  const url = avatarUrl(profile.avatar_path);
  const [loaded, setLoaded] = useState(!url);
  return {
    tracks: !loaded,
    view: (
      <View style={{ alignItems: 'center', opacity: stale ? 0.55 : 1 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: profile.color, borderWidth: 3, borderColor: mine ? '#1E1B16' : '#fff',
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {url ? <Image source={{ uri: url }} style={{ width: 44, height: 44 }} onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} /> : (
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{initials(profile.display_name)}</Text>
          )}
        </View>
        <View style={{ backgroundColor: '#1E1B16', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, marginTop: 2 }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }} numberOfLines={1}>{mine ? 'Du' : profile.display_name.split(' ')[0]}</Text>
        </View>
      </View>
    ),
  };
}

function PersonMarkerOnMap(props: { profile: Profile; stale: boolean; mine: boolean; lat: number; lng: number; onPress: () => void }) {
  const m = usePersonMarker(props);
  return (
    <Marker coordinate={{ latitude: props.lat, longitude: props.lng }} anchor={{ x: 0.5, y: 0.4 }} tracksViewChanges={m.tracks}
      zIndex={props.mine ? 30 : 20} onPress={props.onPress}>
      {m.view}
    </Marker>
  );
}

export default function MapTab() {
  const c = useColors();
  const router = useRouter();
  const { userId } = useAuth();
  const { round, stations, locations, checkins, members, messages, me, isOrganizer, profileOf, tracking } = useRound();
  const map = useRef<MapView>(null);
  const list = useRef<FlatList>(null);
  const [selected, setSelected] = useState(0);
  const [trackingOpen, setTrackingOpen] = useState(false);
  // Zeitpunkt der zuletzt geschlossenen Durchsage; bleibt über App-Neustarts erhalten
  const [dismissedUntil, setDismissedUntil] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const battery = useBatteryOptimized();
  // Wabern nur, solange die Karte sichtbar ist (spart Akku)
  const [visible, setVisible] = useState(false);
  useFocusEffect(useCallback(() => {
    setVisible(true);
    return () => setVisible(false);
  }, []));

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const stats = useMemo(() => stationStats(stations, checkins, now), [stations, checkins, now]);
  const myOpen = checkins.find((ch) => ch.user_id === userId && !ch.left_at) ?? null;
  const myVisited = useMemo(() => new Set(checkins.filter((ch) => ch.user_id === userId).map((ch) => ch.station_id)), [checkins, userId]);
  const active = round?.status === 'aktiv';

  const fitAll = useCallback(() => {
    const points = [
      ...stations.map((s) => ({ latitude: s.lat, longitude: s.lng })),
      ...locations.map((l) => ({ latitude: l.lat, longitude: l.lng })),
    ];
    if (points.length === 1) map.current?.animateToRegion({ ...points[0], latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
    else if (points.length > 1) map.current?.fitToCoordinates(points, { edgePadding: { top: 110, right: 60, bottom: 250, left: 60 }, animated: true });
  }, [stations, locations]);

  // Beim ersten Laden alles in den Blick nehmen
  const fitted = useRef(false);
  const onMapReady = () => {
    if (!fitted.current) {
      fitted.current = true;
      setTimeout(fitAll, 300);
    }
  };

  const focusStation = (index: number, scroll = true) => {
    const s = stations[index];
    if (!s) return;
    setSelected(index);
    map.current?.animateToRegion({ latitude: s.lat - 0.0012, longitude: s.lng, latitudeDelta: 0.007, longitudeDelta: 0.007 }, 400);
    if (scroll) list.current?.scrollToOffset({ offset: index * (CARD_WIDTH + CARD_GAP), animated: true });
  };

  const focusPerson = (uid: string) => {
    const l = locations.find((x) => x.user_id === uid);
    if (!l) {
      const p = profileOf(uid);
      return Alert.alert(uid === userId ? 'Kein Standort' : p.display_name, uid === userId
        ? 'Dein Standort wird gerade nicht geteilt.'
        : active ? 'Teilt gerade keinen Standort.' : 'Standorte sind erst sichtbar, wenn der Hop läuft.');
    }
    map.current?.animateToRegion({ latitude: l.lat - 0.0008, longitude: l.lng, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 400);
  };

  const onCarouselEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / (CARD_WIDTH + CARD_GAP));
    if (index !== selected) focusStation(index, false);
  };

  const checkin = async (stationId: string | null) => {
    if (!round) return;
    setBusy(true);
    const { error } = await supabase.rpc('manual_checkin', { p_round: round.id, p_station: stationId });
    setBusy(false);
    if (error) Alert.alert('Das hat nicht geklappt', errorText(error));
  };

  // Standort-Hinweis einmal von selbst zeigen, wenn der Hop läuft und die Berechtigung fehlt
  const prompted = useRef(false);
  useEffect(() => {
    if (active && me?.sharing && tracking === 'keine-berechtigung' && !prompted.current) {
      prompted.current = true;
      setTrackingOpen(true);
    }
  }, [active, me?.sharing, tracking]);

  const dismissKey = round ? `dayhop:durchsage:${round.id}` : null;
  useEffect(() => {
    if (dismissKey) storage.getItem(dismissKey).then(setDismissedUntil);
  }, [dismissKey]);
  const dismissAnnouncement = (createdAt: string) => {
    setDismissedUntil(createdAt);
    if (dismissKey) storage.setItem(dismissKey, createdAt);
  };

  const announcement = useMemo(() => {
    const a = messages.find((m) => m.kind === 'announcement');
    if (!a || now - new Date(a.created_at).getTime() >= 60 * 60_000) return null;
    return dismissedUntil && a.created_at <= dismissedUntil ? null : a;
  }, [messages, dismissedUntil, now]);

  if (!round) return null;

  const chip = !active
    ? { icon: 'pause-circle' as const, text: round.status === 'geplant' ? 'Ortung startet mit dem Hop' : 'Hop beendet', bg: c.card, fg: c.muted }
    : !me?.sharing
      ? { icon: 'eye-off' as const, text: 'Standort pausiert', bg: c.card, fg: c.ink }
      : tracking === 'hintergrund' && battery.optimized
        ? { icon: 'battery-dead' as const, text: 'Akku-Sparen bremst Ortung', bg: c.sunSoft, fg: c.ink }
      : tracking === 'hintergrund'
        ? { icon: 'navigate' as const, text: 'Standort wird geteilt', bg: c.tealSoft, fg: c.teal }
        : tracking === 'vordergrund'
          ? { icon: 'warning' as const, text: 'Nur bei geöffneter App', bg: c.sunSoft, fg: c.ink }
          : { icon: 'navigate-outline' as const, text: 'Standort freigeben', bg: c.accent, fg: c.onAccent };

  const first = stations[0];
  const sel = stations[selected];

  return (
    <View style={{ flex: 1 }}>
      {!mapsConfigured ? <MapMissing /> : (
      <MapView
        ref={map}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        onMapReady={onMapReady}
        initialRegion={first
          ? { latitude: first.lat, longitude: first.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }
          : { latitude: 51.1657, longitude: 10.4515, latitudeDelta: 9, longitudeDelta: 9 }}
        mapPadding={{ top: 56, right: 0, bottom: stations.length ? 196 : 120, left: 0 }}
        toolbarEnabled={false}
        showsCompass={false}
        showsMyLocationButton={false}
        showsPointsOfInterests={false}>
        {stations.length > 1 && (
          <Polyline coordinates={stations.map((s) => ({ latitude: s.lat, longitude: s.lng }))} strokeColor={c.accent} strokeWidth={4} geodesic />
        )}
        {stats.map((st, i) => (
          <StationGlow key={`glow-${st.station.id}`} lat={st.station.lat} lng={st.station.lng} radius={st.station.radius_m}
            color={stationColor(st.station, i)} present={st.present.length} animate={visible} />
        ))}
        {sel && (
          <Circle center={{ latitude: sel.lat, longitude: sel.lng }} radius={sel.radius_m} zIndex={25}
            strokeColor={stationColor(sel, selected)} strokeWidth={2} fillColor={withAlpha(stationColor(sel, selected), 0.08)} />
        )}
        {stations.map((s, i) => {
          const here = myOpen?.station_id === s.id;
          const done = myVisited.has(s.id);
          const on = i === selected;
          const present = stats[i]?.present.length ?? 0;
          const col = stationColor(s, i);
          // Größer, je mehr Leute eingecheckt sind
          const size = glowLevel(present).markerSize + (on ? 6 : 0);
          return (
            <Marker key={`${s.id}-${i}-${here}-${done}-${on}-${present}-${col}`} coordinate={{ latitude: s.lat, longitude: s.lng }} anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false} zIndex={on ? 32 : 30} onPress={() => focusStation(i)}>
              <View style={{ width: size + 8, height: size + 8, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: col, borderWidth: 3, borderColor: '#fff',
                  alignItems: 'center', justifyContent: 'center' }}>
                  {done && !here && present === 0 ? <Ionicons name="checkmark" size={18} color="#fff" /> : (
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: Math.round(size * 0.42), textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 2 }}>{i + 1}</Text>
                  )}
                </View>
                {present > 0 && (
                  <View style={{ position: 'absolute', top: 0, right: 0, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, backgroundColor: '#1E1B16',
                    borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{present}</Text>
                  </View>
                )}
              </View>
            </Marker>
          );
        })}
        {locations.map((l) => {
          const p = profileOf(l.user_id);
          const stale = now - new Date(l.recorded_at).getTime() > STALE_MS;
          // Der Schlüssel erzwingt ein Neuzeichnen, wenn sich das Aussehen ändert (Marker werden sonst nur einmal gerendert)
          return (
            <PersonMarkerOnMap key={`${l.user_id}-${stale}-${p.display_name}-${p.color}-${p.avatar_path}`} profile={p} lat={l.lat} lng={l.lng}
              mine={l.user_id === userId} stale={stale}
              onPress={() => Alert.alert(p.display_name, `Standort ${formatAgo(l.recorded_at, now)}`)} />
          );
        })}
      </MapView>
      )}

      {/* Oben: Durchsage und Ortungsstatus */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: space.s, left: space.m, right: space.m, gap: space.s }}>
        {announcement && (
          <View style={{ backgroundColor: c.sun, borderRadius: radius.m, padding: space.m, flexDirection: 'row', gap: space.m, alignItems: 'flex-start',
            shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
            <Ionicons name="megaphone" size={22} color="#1E1B16" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#1E1B16', fontWeight: '700', fontSize: 12 }}>DURCHSAGE · {formatTime(announcement.created_at)}</Text>
              <Text style={{ color: '#1E1B16', fontSize: 16, lineHeight: 21 }}>{announcement.body}</Text>
            </View>
            <Pressable onPress={() => dismissAnnouncement(announcement.created_at)} hitSlop={12} accessibilityLabel="Durchsage ausblenden">
              <Ionicons name="close" size={22} color="#1E1B16" />
            </Pressable>
          </View>
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }} pointerEvents="box-none">
          <Pressable onPress={() => setTrackingOpen(true)} accessibilityRole="button"
            style={{ backgroundColor: chip.bg, borderRadius: radius.pill, minHeight: 40, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7,
              shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 }}>
            <Ionicons name={chip.icon} size={17} color={chip.fg} />
            <Text style={{ color: chip.fg, fontWeight: '700', fontSize: 14 }}>{chip.text}</Text>
          </Pressable>
          <View style={{ gap: space.s }}>
            <View style={{ elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, borderRadius: 24 }}>
              <IconButton icon="scan" label="Alles zeigen" onPress={fitAll} bg={c.card} size={48} />
            </View>
            {userId && locations.some((l) => l.user_id === userId) && (
              <View style={{ elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, borderRadius: 24 }}>
                <IconButton icon="locate" label="Mein Standort" onPress={() => focusPerson(userId)} bg={c.card} size={48} />
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Unten: Personen und Stationen */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: space.m, gap: space.s }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.l, gap: 6 }}>
          {members.map((m) => {
            const l = locations.find((x) => x.user_id === m.user_id);
            return (
              <Pressable key={m.user_id} onPress={() => focusPerson(m.user_id)} accessibilityRole="button" accessibilityLabel={`${m.profile.display_name} auf der Karte zeigen`}
                style={{ padding: 3, borderRadius: 26, backgroundColor: c.card, elevation: 2, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } }}>
                <Avatar profile={m.profile} size={40} dimmed={!l || now - new Date(l.recorded_at).getTime() > STALE_MS} />
              </Pressable>
            );
          })}
        </ScrollView>

        {stations.length === 0 ? (
          <Card style={{ marginHorizontal: space.l, gap: space.s }}>
            <Heading size={19}>Noch keine Stationen</Heading>
            <Body muted>{isOrganizer ? 'Lege die erste Station an, dann erscheint hier die Route.' : 'Die Organisation hat noch keine Stationen angelegt.'}</Body>
            {isOrganizer && <Button title="Station hinzufügen" icon="add" onPress={() => router.push(`/round/${round.id}/station`)} />}
          </Card>
        ) : (
          <FlatList
            ref={list}
            data={stats}
            horizontal
            keyExtractor={(s) => s.station.id}
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_WIDTH + CARD_GAP}
            decelerationRate="fast"
            onMomentumScrollEnd={onCarouselEnd}
            contentContainerStyle={{ paddingHorizontal: (Dimensions.get('window').width - CARD_WIDTH) / 2, gap: CARD_GAP }}
            getItemLayout={(_d, index) => ({ length: CARD_WIDTH + CARD_GAP, offset: index * (CARD_WIDTH + CARD_GAP), index })}
            renderItem={({ item, index }) => {
              const s = item.station;
              const here = myOpen?.station_id === s.id;
              return (
                <Card style={{ width: CARD_WIDTH, padding: space.m, gap: space.s, elevation: 4, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } }}
                  onPress={() => focusStation(index)}>
                  <View style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: stationColor(s, index), alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{index + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Heading size={18} style={{ lineHeight: 22 }}>{s.name}</Heading>
                      <Body muted small numberOfLines={1}>
                        {[s.planned_at ? `${formatTime(s.planned_at)} Uhr` : null, s.address].filter(Boolean).join(' · ') || `Station ${index + 1} von ${stations.length}`}
                      </Body>
                    </View>
                    {isOrganizer && <IconButton icon="create-outline" label="Station bearbeiten" onPress={() => router.push(`/round/${round.id}/station?stationId=${s.id}`)} />}
                  </View>
                  {s.note ? <Body small numberOfLines={2}>{s.note}</Body> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: 30 }}>
                    {item.present.length > 0 && <AvatarStack profiles={item.present.map(profileOf)} />}
                    <Body muted small style={{ flex: 1 }}>
                      {item.present.length > 0 ? `${item.present.length} gerade da · ` : ''}{item.visitors.length} von {members.length} waren hier
                    </Body>
                  </View>
                  <View style={{ flexDirection: 'row', gap: space.s }}>
                    <Button small variant="soft" icon="walk" title="Route" style={{ flex: 1 }}
                      onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=walking`)} />
                    {active && (here
                      ? <Button small variant="soft" icon="exit-outline" title="Auschecken" style={{ flex: 1 }} loading={busy} onPress={() => checkin(null)} />
                      : <Button small icon="checkmark-circle" title="Einchecken" style={{ flex: 1 }} loading={busy} onPress={() => checkin(s.id)} />)}
                  </View>
                </Card>
              );
            }}
          />
        )}
      </View>

      <TrackingSheet visible={trackingOpen} onClose={() => setTrackingOpen(false)} />
    </View>
  );
}
