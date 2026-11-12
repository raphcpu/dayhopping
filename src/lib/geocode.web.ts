/// <reference types="google.maps" />
// Web: Geocoding über die Google Maps JavaScript API (wird mit der Karte geladen)
async function geocoder(): Promise<google.maps.Geocoder | null> {
  if (typeof google === 'undefined' || !google.maps?.importLibrary) return null;
  const lib = (await google.maps.importLibrary('geocoding')) as google.maps.GeocodingLibrary;
  return new lib.Geocoder();
}

export async function geocode(query: string): Promise<{ latitude: number; longitude: number } | null> {
  const g = await geocoder();
  if (!g) throw new Error('Karte noch nicht geladen');
  const { results } = await g.geocode({ address: query, region: 'de' });
  const loc = results[0]?.geometry.location;
  return loc ? { latitude: loc.lat(), longitude: loc.lng() } : null;
}

export async function reverseGeocode(p: { latitude: number; longitude: number }): Promise<string | null> {
  const g = await geocoder();
  if (!g) return null;
  const { results } = await g.geocode({ location: { lat: p.latitude, lng: p.longitude } });
  return results[0]?.formatted_address?.replace(/, Deutschland$/, '') ?? null;
}
