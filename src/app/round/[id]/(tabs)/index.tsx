import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, FlatList, Image, Linking, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, Text, View } from 'react-native';
import MapView, { Circle, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { MapMissing } from '@/components/MapMissing';
import { showProfile } from '@/components/ProfileSheet';
import { StationGlow } from '@/components/StationGlow';
import { StationMarker } from '@/components/StationMarker';
import { TrackingSheet } from '@/components/TrackingSheet';
import { AvatarStack, Body, Button, Card, Heading, IconButton } from '@/components/ui';
import { useBatteryOptimized } from '@/lib/battery';
import { mapsConfigured } from '@/lib/config';
import { glowLevel, stationColor, withAlpha } from '@/lib/stationColors';
import { storage } from '@/lib/storage';
import { formatTime, initials } from '@/lib/format';
import { stationStats } from '@/lib/stats';
import { avatarUrl } from '@/lib/supabase';
import { radius, softShadow, space, useColors } from '@/lib/theme';
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
  // Stationsinfo erscheint erst nach Antippen einer Station
  const [cardOpen, setCardOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  // Zeitpunkt der zuletzt geschlossenen Durchsage; bleibt über App-Neustarts erhalten
  const [dismissedUntil, setDismissedUntil] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
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
  const checkedIn = useMemo(() => new Set(checkins.filter((ch) => !ch.left_at).map((ch) => ch.user_id)), [checkins]);
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
      ? { icon: 'eye-off' as const, text: 'Standort pausiert', bg: c.card, fg: c.muted }
      : tracking === 'hintergrund' && battery.optimized
        ? { icon: 'battery-dead' as const, text: 'Akku-Sparen bremst Ortung', bg: c.card, fg: c.danger }
      : tracking === 'hintergrund'
        ? { icon: 'navigate' as const, text: 'Standort wird geteilt', bg: c.card, fg: c.teal }
        : tracking === 'vordergrund'
          ? { icon: 'warning' as const, text: 'Nur bei geöffneter App', bg: c.card, fg: c.danger }
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
        onPress={(e) => {
          // Tippen auf freie Kartenfläche schließt die Stationsinfo (Marker-Tipps auf iOS ausgenommen)
          if ((e.nativeEvent as { action?: string }).action !== 'marker-press') setCardOpen(false);
        }}
        initialRegion={first
          ? { latitude: first.lat, longitude: first.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }
          : { latitude: 51.1657, longitude: 10.4515, latitudeDelta: 9, longitudeDelta: 9 }}
        mapPadding={{ top: 56, right: 0, bottom: cardOpen ? 196 : 70, left: 0 }}
        toolbarEnabled={false}
        showsCompass={false}
        showsMyLocationButton={false}
        showsPointsOfInterests={false}>
        {stations.length > 1 && (
          // Farbverlauf: jedes Teilstück geht von der Farbe einer Station in die der nächsten über
          <Polyline coordinates={stations.map((s) => ({ latitude: s.lat, longitude: s.lng }))} strokeColor={stationColor(stations[0], 0)}
            strokeColors={stations.map((s, i) => stationColor(s, i))} strokeWidth={6} lineCap="round" lineJoin="round" geodesic />
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
          const present = stats[i]?.present ?? [];
          const col = stationColor(s, i);
          const on = i === selected;
          const profiles = present.map(profileOf);
          // Neu zeichnen, wenn sich Personen, Auswahl, Haken oder Farbe ändern
          const key = `${s.id}-${i}-${on}-${myVisited.has(s.id)}-${col}-${profiles.map((p) => `${p.id}:${p.avatar_path}`).join(',')}`;
          return (
            <StationMarker key={key} lat={s.lat} lng={s.lng} number={i + 1} color={col}
              size={glowLevel(present.length).markerSize + (on ? 6 : 0)} visited={myVisited.has(s.id)} selected={on} present={profiles}
              onPress={() => { focusStation(i, false); setCardOpen(true); }}
              onPetalPress={(uid) => showProfile(uid, { onShowOnMap: () => focusPerson(uid) })} />
          );
        })}
        {locations.filter((l) => !checkedIn.has(l.user_id)).map((l) => {
          // Eingecheckte erscheinen als Blütenblätter an ihrer Station, nicht zusätzlich auf ihrem GPS-Punkt
          const p = profileOf(l.user_id);
          const stale = now - new Date(l.recorded_at).getTime() > STALE_MS;
          // Der Schlüssel erzwingt ein Neuzeichnen, wenn sich das Aussehen ändert (Marker werden sonst nur einmal gerendert)
          return (
            <PersonMarkerOnMap key={`${l.user_id}-${stale}-${p.display_name}-${p.color}-${p.avatar_path}`} profile={p} lat={l.lat} lng={l.lng}
              mine={l.user_id === userId} stale={stale}
              onPress={() => showProfile(l.user_id, { onShowOnMap: () => focusPerson(l.user_id) })} />
          );
        })}
      </MapView>
      )}

      {/* Oben: Durchsage und Ortungsstatus */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: space.s, left: space.m, right: space.m, gap: space.s }}>
        {announcement && (
          <View style={{ backgroundColor: '#FFD43B', borderRadius: radius.l, padding: space.l, flexDirection: 'row', gap: space.m, alignItems: 'flex-start', ...softShadow(c, 2) }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#1E1B16', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="megaphone" size={19} color="#FFD43B" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: '#5C4A00', fontWeight: '700', fontSize: 13 }}>Durchsage um {formatTime(announcement.created_at)}</Text>
              <Text style={{ color: '#1E1B16', fontSize: 16, lineHeight: 22, fontWeight: '600' }}>{announcement.body}</Text>
            </View>
            <Pressable onPress={() => dismissAnnouncement(announcement.created_at)} hitSlop={12} accessibilityLabel="Durchsage ausblenden">
              <Ionicons name="close" size={22} color="#1E1B16" />
            </Pressable>
          </View>
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }} pointerEvents="box-none">
          <Pressable onPress={() => setTrackingOpen(true)} accessibilityRole="button"
            style={{ backgroundColor: chip.bg, borderRadius: radius.pill, minHeight: 42, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8, ...softShadow(c, 2) }}>
            <Ionicons name={chip.icon} size={17} color={chip.fg} />
            <Text style={{ color: chip.fg, fontWeight: '700', fontSize: 14 }}>{chip.text}</Text>
          </Pressable>
          <View style={{ gap: space.s }}>
            <View style={{ borderRadius: 24, ...softShadow(c, 2) }}>
              <IconButton icon="scan" label="Alles zeigen" onPress={fitAll} bg={c.card} size={48} />
            </View>
            {userId && locations.some((l) => l.user_id === userId) && (
              <View style={{ borderRadius: 24, ...softShadow(c, 2) }}>
                <IconButton icon="locate" label="Mein Standort" onPress={() => focusPerson(userId)} bg={c.card} size={48} />
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Unten: Stationsinfo nach Antippen */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: space.m, gap: space.s }}>

        {stations.length === 0 ? (
          <Card style={{ marginHorizontal: space.l, gap: space.s }}>
            <Heading size={19}>Noch keine Stationen</Heading>
            <Body muted>{isOrganizer ? 'Lege die erste Station an, dann erscheint hier die Route.' : 'Die Organisation hat noch keine Stationen angelegt.'}</Body>
            {isOrganizer && <Button title="Station hinzufügen" icon="add" onPress={() => router.push(`/round/${round.id}/station`)} />}
          </Card>
        ) : !cardOpen ? null : (
          <FlatList
            ref={list}
            initialScrollIndex={selected}
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
                <Card style={{ width: CARD_WIDTH, padding: space.l, gap: space.m, ...softShadow(c, 2) }}
                  onPress={() => focusStation(index)}>
                  <View style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: stationColor(s, index), alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{index + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Heading size={18} style={{ lineHeight: 22 }}>{s.name}</Heading>
                      <Body muted small>
                        {s.planned_at ? `${formatTime(s.planned_at)} Uhr · Station ${index + 1} von ${stations.length}` : `Station ${index + 1} von ${stations.length}`}
                      </Body>
                    </View>
                    {isOrganizer && <IconButton icon="create-outline" label="Station bearbeiten" onPress={() => router.push(`/round/${round.id}/station?stationId=${s.id}`)} />}
                    <IconButton icon="close" label="Stationsinfo schließen" onPress={() => setCardOpen(false)} />
                  </View>
                  {(s.address || s.floor || s.bell) && (
                    <View style={{ gap: 4 }}>
                      {s.address && (
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                          <Ionicons name="location-outline" size={17} color={c.muted} style={{ marginTop: 1 }} />
                          <Body small selectable style={{ flex: 1 }}>{s.address}</Body>
                        </View>
                      )}
                      {s.floor && (
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                          <Ionicons name="layers-outline" size={17} color={c.muted} />
                          <Body small style={{ flex: 1 }}>Etage: {s.floor}</Body>
                        </View>
                      )}
                      {s.bell && (
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                          <Ionicons name="notifications-outline" size={17} color={c.muted} />
                          <Body small style={{ flex: 1 }}>Klingel: {s.bell}</Body>
                        </View>
                      )}
                    </View>
                  )}
                  {myVisited.has(s.id) && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
                      <Body small bold style={{ color: '#16A34A' }}>{here ? 'Du bist gerade hier' : 'Hier warst du schon'}</Body>
                    </View>
                  )}
                  {s.note ? <Body small numberOfLines={2}>{s.note}</Body> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: 30 }}>
                    {item.present.length > 0 && <AvatarStack profiles={item.present.map(profileOf)} />}
                    <Body muted small style={{ flex: 1 }}>
                      {item.present.length > 0 ? `${item.present.length} gerade da · ` : ''}{item.visitors.length} von {members.length} waren hier
                    </Body>
                  </View>
                  <View style={{ flexDirection: 'row', gap: space.s }}>
                    <Button small variant="soft" icon="walk" title="Route dorthin" style={{ flex: 1 }}
                      onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=walking`)} />
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
