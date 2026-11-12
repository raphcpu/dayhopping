#!/usr/bin/env bash
# Öffnet die versteckte Kartentest-Seite (ohne Anmeldung) und prüft, ob Google Maps zeichnet.
set -u
PKG="${APP_IDENTIFIER:-de.dayhop.app}"
APK=$(ls android/app/build/outputs/apk/release/*.apk | head -1)
mkdir -p smoke
adb wait-for-device
adb install -r "$APK" || { echo "KARTE: INSTALLATION FEHLGESCHLAGEN"; exit 0; }
adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d "dayhop://kartentest" "$PKG" >/dev/null
sleep 40
echo "----- Bildschirmtexte -----"; python3 scripts/ui.py dump | head -30
adb exec-out screencap -p > smoke/karte.png
adb logcat -d -v brief > smoke/karte-logcat.txt
echo "----- Kartenprotokoll -----"
grep -iE "Google Maps|maps_core|API_KEY|API key|Authorization|rnmaps|MapView|FATAL|ReactNativeJS|zzam|GLThread|libGLES|eglCreate" smoke/karte-logcat.txt | grep -v "ViewManagerPropertyUpdater" | head -80
echo "----- Ende Kartenprotokoll -----"
echo "KARTE_BASE64_START"; base64 -w 0 smoke/karte.png; echo; echo "KARTE_BASE64_ENDE"
exit 0
