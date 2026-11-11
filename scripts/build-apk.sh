#!/usr/bin/env bash
# Baut die APK auf dem eigenen Rechner. Voraussetzung: Android Studio (bzw. Android SDK,
# ANDROID_HOME gesetzt), JDK 17 und eine ausgefüllte .env.
# Ergebnis: android/app/build/outputs/apk/release/app-release.apk
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Die Datei .env fehlt. Vorlage: .env.example"; exit 1; }
set -a; . ./.env; set +a
for v in EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY GOOGLE_MAPS_API_KEY; do
  [ -n "${!v:-}" ] || { echo "In .env fehlt $v"; exit 1; }
done
[ -n "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ] || { echo "ANDROID_HOME ist nicht gesetzt (Android SDK installieren)."; exit 1; }

npm ci
npx expo prebuild --platform android --no-install
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
echo
echo "Fertig: $(pwd)/app/build/outputs/apk/release/app-release.apk"
