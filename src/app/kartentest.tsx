import { Stack } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { mapsConfigured } from '@/lib/config';

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
          <Circle center={{ latitude: 53.5605, longitude: 9.981 }} radius={120} fillColor="rgba(255,90,54,0.3)" strokeColor="#FF5A36" />
        </MapView>
      ) : <View style={{ flex: 1 }} />}
      <Text style={{ position: 'absolute', bottom: 40, left: 16, right: 16, textAlign: 'center', backgroundColor: '#fff', padding: 8, fontWeight: '700' }}>
        {mapsConfigured ? status : 'KEIN SCHLÜSSEL'}
      </Text>
    </View>
  );
}
