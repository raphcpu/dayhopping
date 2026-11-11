import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DateField } from '@/components/DateField';
import { Body, Button, Chip, Field, SectionLabel } from '@/components/ui';
import { errorText, parseDay } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';
import { useRound } from '@/providers/RoundProvider';

const RADII = [40, 60, 100, 150];

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
  const [query, setQuery] = useState('');
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(existing ? { latitude: existing.lat, longitude: existing.lng } : null);
  const [radiusM, setRadiusM] = useState(existing?.radius_m ?? 60);
  const [time, setTime] = useState<Date | null>(existing?.planned_at ? new Date(existing.planned_at) : null);
  const [note, setNote] = useState(existing?.note ?? '');
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
    const row = { name: name.trim(), address: address.trim() || null, lat: pin.latitude, lng: pin.longitude, radius_m: radiusM, planned_at: plannedAt, note: note.trim() || null };
    setBusy('speichern');
    const { error } = existing
      ? await supabase.from('stations').update(row).eq('id', existing.id)
      : await supabase.from('stations').insert({ ...row, round_id: round.id, position: Math.max(0, ...stations.map((s) => s.position)) + 1 });
    setBusy(null);
    if (error) return setError(errorText(error));
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
          <View style={{ height: 260, borderRadius: radius.m, overflow: 'hidden', borderWidth: 1, borderColor: c.line }}>
            <MapView ref={map} provider={PROVIDER_GOOGLE} style={{ flex: 1 }} initialRegion={start} toolbarEnabled={false}
              onLongPress={(e) => place(e.nativeEvent.coordinate)} onPoiClick={(e) => { place(e.nativeEvent.coordinate); if (!name.trim()) setName(e.nativeEvent.name.split('\n')[0]); }}>
              {pin && <Marker coordinate={pin} draggable onDragEnd={(e) => place(e.nativeEvent.coordinate)} pinColor={c.accent} />}
              {pin && <Circle center={pin} radius={radiusM} strokeColor={c.accent} strokeWidth={1.5} fillColor="rgba(255,90,54,0.16)" />}
            </MapView>
          </View>
          <Body muted small>Lange auf die Karte tippen setzt den Punkt. Du kannst die Nadel auch verschieben oder einen Ort auf der Karte antippen.</Body>
          <Button small variant="soft" icon="locate" title="Meinen Standort nehmen" onPress={here} loading={busy === 'hier'} style={{ alignSelf: 'flex-start' }} />
        </View>

        <Field label="Adresse (optional)" value={address} onChangeText={setAddress} placeholder="Wird beim Setzen des Punkts ausgefüllt" maxLength={160} />

        <View>
          <SectionLabel>Check-in-Radius</SectionLabel>
          <View style={{ flexDirection: 'row', gap: space.s, flexWrap: 'wrap' }}>
            {RADII.map((r) => <Chip key={r} label={`${r} m`} active={radiusM === r} onPress={() => setRadiusM(r)} />)}
          </View>
          <Body muted small style={{ marginTop: space.s }}>Wer im Kreis ankommt, wird automatisch eingecheckt. In engen Straßen eher klein, bei Parks und Plätzen größer.</Body>
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
