import * as Location from 'expo-location';

/** Adresse/Ort → Koordinate (Geocoder des Geräts) */
export async function geocode(query: string): Promise<{ latitude: number; longitude: number } | null> {
  const [hit] = await Location.geocodeAsync(query);
  return hit ? { latitude: hit.latitude, longitude: hit.longitude } : null;
}

/** Koordinate → lesbare Adresse */
export async function reverseGeocode(p: { latitude: number; longitude: number }): Promise<string | null> {
  const [a] = await Location.reverseGeocodeAsync(p);
  if (!a) return null;
  return [[a.street, a.streetNumber].filter(Boolean).join(' '), [a.postalCode, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null;
}
