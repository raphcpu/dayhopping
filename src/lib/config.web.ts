/** Web: Karte nur mit eigenem Browser-Schlüssel (der Android-Schlüssel gilt nur für die App) */
export const mapsConfigured: boolean = !!process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY;
