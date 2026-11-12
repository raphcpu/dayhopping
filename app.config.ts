import type { ConfigContext, ExpoConfig } from 'expo/config';

// Schlüssel kommen aus .env (lokal) bzw. aus EAS-Umgebungsvariablen (Build).
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || '';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'DayHop',
  slug: 'dayhop',
  scheme: 'dayhop',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: process.env.APP_IDENTIFIER || 'de.dayhop.app',
    supportsTablet: false,
    infoPlist: {
      UIBackgroundModes: ['location', 'remote-notification'],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: process.env.APP_IDENTIFIER || 'de.dayhop.app',
    adaptiveIcon: {
      backgroundColor: '#FF5A36',
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON || undefined,
    // erlaubt den direkten Dialog „Akku-Optimierung ausschalten“ (für zuverlässige Hintergrund-Ortung)
    permissions: ['android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'],
  },
  plugins: [
    'expo-router',
    [
      'expo-build-properties',
      {
        // R8 entfernte beim Verkleinern die Datenbankklasse von WorkManager (Hintergrund-Ortung,
        // Push): Die App stürzte sofort beim Start ab. Ohne Verkleinern ist die APK etwas größer,
        // aber nichts wird mehr versehentlich entfernt.
        android: {
          enableMinifyInReleaseBuilds: false,
          enableShrinkResourcesInReleaseBuilds: false,
          extraProguardRules: '-keep class * extends androidx.room.RoomDatabase { <init>(); }\n-keep class androidx.work.** { *; }',
        },
      },
    ],
    'expo-font',
    ['expo-splash-screen', { backgroundColor: '#FF5A36', image: './assets/splash-icon.png', imageWidth: 160 }],
    [
      'react-native-maps',
      { iosGoogleMapsApiKey: googleMapsApiKey, androidGoogleMapsApiKey: googleMapsApiKey },
    ],
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'DayHop teilt deinen Standort mit deiner Gruppe, solange ein Hop läuft – auch wenn die App im Hintergrund ist. So sehen alle, wer wo ist, und Check-ins passieren automatisch.',
        locationWhenInUsePermission:
          'DayHop zeigt deinen Standort auf der Karte und teilt ihn mit deiner Gruppe, solange ein Hop läuft.',
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    ['expo-notifications', { color: '#FF5A36' }],
    [
      'expo-image-picker',
      {
        photosPermission: 'DayHop greift auf deine Fotos zu, damit du Bilder und Videos zur Collage hinzufügen kannst.',
        cameraPermission: 'DayHop nutzt die Kamera für Fotos und Videos in der Collage.',
        microphonePermission: 'DayHop nutzt das Mikrofon für Videos in der Collage.',
      },
    ],
    'expo-video',
  ],
  extra: {
    eas: { projectId: process.env.EAS_PROJECT_ID || undefined },
    // Ohne Schlüssel stürzt Google Maps beim Anzeigen ab: Die App zeigt dann einen Hinweis statt der Karte.
    mapsConfigured: googleMapsApiKey.length > 0,
  },
});
