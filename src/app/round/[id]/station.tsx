import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DateField } from '@/components/DateField';
import { MapMissing } from '@/components/MapMissing';
import { Body, Button, Field, SectionLabel } from '@/components/ui';
import { mapsConfigured } from '@/lib/config';
import { errorText, parseDay } from '@/lib/format';
import { STATION_COLORS, STATION_RADIUS_M } from '@/lib/stationColors';
import { supabase } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';
import { useRound } from '@/providers/RoundProvider';


export default function StationScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { stationId } = useLocalSearchParams<{ stationId?: string }>();
  const { round, stations, locations, isOrganizer } = useRound();
  const existing = useMemo(() => stations.find((s) => s.id === stationId) ?? null, [stations, stationId]);
  const map = useRef<MapView>(null);

  const [name, setName] = useState(existing?.name ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [floor, setFloor] = useState(existing?.floor ?? '');
  const [bell, setBell] = useState(existing?.bell ?? '');
  const [query, setQuery] = useState('');
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(existing ? { latitude: existing.lat, longitude: existing.lng } : null);
  const [time, setTime] = useState<Date | null>(existing?.planned_at ? new Date(existing.planned_at) : null);
  const [note, setNote] = useState(existing?.note ?? '');
  // Stationsnummer (1 = erste Station der Route)
  const count = existing ? stations.length : stations.length + 1;
  const [number, setNumber] = useState(() => (existing ? stations.findIndex((s) => s.id === existing.id) + 1 : count));
  // Farben anderer Stationen dieses Hops sind vergeben
  const taken = useMemo(
    () => new Set(stations.filter((s) => s.id !== existing?.id && s.color).map((s) => s.color!.toUpperCase())),
    [stations, existing],
  );
  const [color, setColor] = useState<string | null>(
    () => existing?.color ?? STATION_COLORS.find((c) => !taken.has(c.hex.toUpperCase()))?.hex ?? null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Startausschnitt: vorhandener Punkt, sonst letzte Station, sonst die Gruppe, sonst Deutschland
  const start = useMemo(() => {
    const last = stations[stations.length - 1];
    const l = locations[0];
    if (pin) return { ...pin, latitudeDelta: 0.005, longitudeDelta: 0.005 };
    if (last) return { latitude: last.lat, longitude: last.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 };
    if (l) return { latitude: l.lat, longitude: l.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 };
    return { latitude: 51.1657, longitude: 10.4515, latitudeDelta: 9, longitudeDelta: 9 };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!round) return null;
  if (!isOrganizer) return <View style={{ padding: space.xl }}><Body>Stationen kann nur die Organisation bearbeiten.</Body></View>;

  const place = async (p: { latitude: number; longitude: number }, fillAddress = true) => {
    setPin(p);
    map.current?.animateToRegion({ ...p, latitudeDelta: 0.004, longitudeDelta: 0.004 }, 350);
    if (!fillAddress) return;
    try {
      const [a] = await Location.reverseGeocodeAsync(p);
      if (a) setAddress([[a.street, a.streetNumber].filter(Boolean).join(' '), [a.postalCode, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', '));
    } catch {
      // Adresse ist nur Zusatzinfo
    }
  };

  const search = async () => {
    if (!query.trim()) return;
    Keyboard.dismiss();
    setBusy('suche');
    setError(null);
    try {
      const [hit] = await Location.geocodeAsync(query.trim());
      if (!hit) setError('Dazu habe ich keinen Ort gefunden. Versuch es mit Straße und Stadt oder setz den Punkt direkt auf der Karte.');
      else await place({ latitude: hit.latitude, longitude: hit.longitude });
    } catch {
      setError('Die Ortssuche ist gerade nicht erreichbar. Setz den Punkt direkt auf der Karte.');
    } finally {
      setBusy(null);
    }
  };

  const here = async () => {
    setBusy('hier');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) throw new Error('Ohne Standortzugriff geht das nicht.');
      const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await place({ latitude: l.coords.latitude, longitude: l.coords.longitude });
    } catch (e) {
      Alert.alert('Standort nicht verfügbar', errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setError(null);
    if (name.trim().length < 1) return setError('Die Station braucht einen Namen.');
    if (!pin) return setError('Setz die Station auf die Karte: Adresse suchen oder lange auf die Karte tippen.');
    let plannedAt: string | null = null;
    if (time) {
      const d = parseDay(round.day);
      d.setHours(time.getHours(), time.getMinutes(), 0, 0);
      plannedAt = d.toISOString();
    }
    const row = { name: name.trim(), address: address.trim() || null, floor: floor.trim() || null, bell: bell.trim() || null, lat: pin.latitude, lng: pin.longitude, radius_m: STATION_RADIUS_M, planned_at: plannedAt, note: note.trim() || null, color };
    setBusy('speichern');
    const { data: saved, error } = existing
      ? await supabase.from('stations').update(row).eq('id', existing.id).select('id').single()
      : await supabase.from('stations').insert({ ...row, round_id: round.id, position: Math.max(0, ...stations.map((s) => s.position)) + 1 }).select('id').single();
    if (error || !saved) {
      setBusy(null);
      return setError(error?.code === '23505' ? 'Diese Farbe hat gerade eine andere Station bekommen. Bitte wähle eine andere.' : errorText(error));
    }
    // Gewählte Nummer anwenden: Station an diese Stelle der Route schieben
    const others = stations.filter((s) => s.id !== saved.id).map((s) => s.id);
    const order = [...others.slice(0, number - 1), saved.id, ...others.slice(number - 1)];
    const currentOrder = [...stations.map((s) => s.id), ...(existing ? [] : [saved.id])];
    if (order.join() !== currentOrder.join()) {
      const { error: orderError } = await supabase.rpc('reorder_stations', { p_round: round.id, p_ids: order });
      if (orderError) {
        setBusy(null);
        return setError(`Gespeichert, aber die Nummer ließ sich nicht ändern: ${errorText(orderError)}`);
      }
    }
    setBusy(null);
    router.back();
  };

  const remove = () => {
    Alert.alert('Station löschen?', 'Check-ins an dieser Station gehen dabei verloren.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('stations').delete().eq('id', existing!.id);
        if (error) return Alert.alert('Das hat nicht geklappt', errorText(error));
        router.back();
      } },
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={64}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.l, paddingBottom: insets.bottom + space.xl, gap: space.l }}>
        <Field label="Name" value={name} onChangeText={setName} placeholder="z. B. Café Elbgold" maxLength={80} autoFocus={!existing} />

        <View style={{ gap: space.s }}>
          <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Field label="Ort suchen" value={query} onChangeText={setQuery} placeholder="Straße, Stadt" returnKeyType="search" onSubmitEditing={search} autoCorrect={false} />
            </View>
            <Button title="Suchen" variant="soft" onPress={search} loading={busy === 'suche'} />
          </View>
          {!mapsConfigured ? <MapMissing compact /> : (
          <View style={{ height: 260, borderRadius: radius.m, overflow: 'hidden', borderWidth: 1, borderColor: c.line }}>
            <MapView ref={map} provider={PROVIDER_GOOGLE} style={{ flex: 1 }} initialRegion={start} toolbarEnabled={false}
              onLongPress={(e) => place(e.nativeEvent.coordinate)} onPoiClick={(e) => { place(e.nativeEvent.coordinate); if (!name.trim()) setName(e.nativeEvent.name.split('\n')[0]); }}>
              {pin && <Marker coordinate={pin} draggable onDragEnd={(e) => place(e.nativeEvent.coordinate)} pinColor={c.accent} />}
              {pin && <Circle center={pin} radius={STATION_RADIUS_M} strokeColor={c.accent} strokeWidth={1.5} fillColor="rgba(91,61,245,0.14)" />}
            </MapView>
          </View>
          )}
          {pin && <Body muted small>Punkt gesetzt: {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}</Body>}
          <Body muted small>Lange auf die Karte tippen setzt den Punkt. Du kannst die Nadel auch verschieben oder einen Ort auf der Karte antippen. Wer im Umkreis von 60 m ankommt, wird automatisch eingecheckt.</Body>
          <Button small variant="soft" icon="locate" title="Meinen Standort nehmen" onPress={here} loading={busy === 'hier'} style={{ alignSelf: 'flex-start' }} />
        </View>

        <Field label="Adresse (optional)" value={address} onChangeText={setAddress} placeholder="Wird beim Setzen des Punkts ausgefüllt" maxLength={160} />
        <View style={{ flexDirection: 'row', gap: space.m }}>
          <View style={{ flex: 1 }}>
            <Field label="Etage (optional)" value={floor} onChangeText={setFloor} placeholder="z. B. 3. OG links" maxLength={40} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Klingel (optional)" value={bell} onChangeText={setBell} placeholder="Name an der Klingel" maxLength={60} />
          </View>
        </View>

        <View>
          <SectionLabel>Stationsnummer</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {Array.from({ length: count }, (_, k) => k + 1).map((n) => {
              const on = n === number;
              return (
                <Pressable key={n} onPress={() => setNumber(n)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`Station Nummer ${n}`}
                  style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: on ? c.ink : c.card, borderWidth: 1.5, borderColor: on ? c.ink : c.line }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: on ? c.bg : c.ink }}>{n}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ fontSize: 13, color: c.muted, marginTop: space.s }}>Reihenfolge auf der Route. Die anderen Stationen rücken entsprechend auf.</Text>
        </View>

        <View>
          <SectionLabel>Leuchtfarbe</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.m }}>
            {STATION_COLORS.map((col) => {
              const isTaken = taken.has(col.hex.toUpperCase());
              const on = color?.toUpperCase() === col.hex.toUpperCase();
              return (
                <Pressable key={col.hex} disabled={isTaken} onPress={() => setColor(col.hex)}
                  accessibilityRole="radio" accessibilityState={{ selected: on, disabled: isTaken }}
                  accessibilityLabel={`${col.name}${isTaken ? ', schon vergeben' : ''}`}
                  style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: col.hex, opacity: isTaken ? 0.25 : 1,
                    alignItems: 'center', justifyContent: 'center', borderWidth: on ? 4 : 0, borderColor: c.ink }}>
                  {on && <Ionicons name="checkmark" size={24} color="#fff" />}
                  {isTaken && <Ionicons name="close" size={22} color={c.ink} />}
                </Pressable>
              );
            })}
          </View>
          <Text style={{ fontSize: 13, color: c.muted, marginTop: space.s }}>
            {color ? `${STATION_COLORS.find((x) => x.hex.toUpperCase() === color.toUpperCase())?.name ?? 'Eigene Farbe'}: ` : ''}
            In dieser Farbe leuchtet die Station auf der Karte. Durchgestrichene Farben haben schon andere Stationen.
          </Text>
        </View>

        <DateField label="Geplante Uhrzeit (optional)" mode="time" value={time} onChange={setTime} placeholder="Keine Uhrzeit" clearable />
        <Field label="Hinweis (optional)" value={note} onChangeText={setNote} placeholder="z. B. Tisch ist auf Anna reserviert" multiline maxLength={300} style={{ minHeight: 84, textAlignVertical: 'top' }} />

        {error && <Body style={{ color: c.danger }}>{error}</Body>}
        <Button title={existing ? 'Änderungen speichern' : 'Station speichern'} onPress={save} loading={busy === 'speichern'} />
        {existing && <Button title="Station löschen" variant="danger" icon="trash-outline" onPress={remove} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
