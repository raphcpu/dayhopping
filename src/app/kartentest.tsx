import { Stack } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { MapView, Circle, Marker, Polyline, PROVIDER_GOOGLE } from '@/lib/maps';
import { StationMarker } from '@/components/StationMarker';
import { mapsConfigured } from '@/lib/config';
import { gradientRoute } from '@/lib/stationColors';

// Versteckte Testseite (dayhop://kartentest): zeigt nur eine Karte, ohne Anmeldung.
// Dient dem automatischen Kartentest im Emulator.
export default function MapTestScreen() {
  const [status, setStatus] = useState('Karte lädt …');
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Kartentest' }} />
      {mapsConfigured ? (
        <MapView provider={PROVIDER_GOOGLE} style={{ flex: 1 }}
          initialRegion={{ latitude: 53.5565, longitude: 9.987, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
          onMapReady={() => setStatus('KARTE BEREIT')} onMapLoaded={() => setStatus('KARTE GELADEN')}>
          <Marker coordinate={{ latitude: 53.553, longitude: 9.9929 }} title="Jungfernstieg" />
          {gradientRoute([{ latitude: 53.553, longitude: 9.9929 }, { latitude: 53.5565, longitude: 9.987 }, { latitude: 53.5605, longitude: 9.981 }],
            ['#FF3B30', '#34C759', '#007AFF']).map((seg, k) => (
            <Polyline key={k} coordinates={seg.coords} strokeColor={seg.color} strokeWidth={6} lineCap="round" />
          ))}
          {/* Station mit drei Blütenblättern: prüft die versetzten Marker */}
          <StationMarker lat={53.5565} lng={9.987} number={2} color="#34C759" size={55} visited selected={false}
            present={[
              { id: 'a', display_name: 'Anna Berg', avatar_path: null, color: '#D6336C' },
              { id: 'b', display_name: 'Ben', avatar_path: null, color: '#2F6FDE' },
              { id: 'c', display_name: 'Cem Yilmaz', avatar_path: null, color: '#E8590C' },
            ]}
            live={[true, false, true]}
            onPress={() => setStatus('STATION ANGETIPPT')} onPetalPress={(id) => setStatus(`BLATT ${id} ANGETIPPT`)} />
          <Circle center={{ latitude: 53.5605, longitude: 9.981 }} radius={120} fillColor="rgba(91,61,245,0.25)" strokeColor="#5B3DF5" />
        </MapView>
      ) : <View style={{ flex: 1 }} />}
      <Text style={{ position: 'absolute', bottom: 40, left: 16, right: 16, textAlign: 'center', backgroundColor: '#fff', padding: 8, fontWeight: '700' }}>
        {mapsConfigured ? status : 'KEIN SCHLÜSSEL'}
      </Text>
    </View>
  );
}
