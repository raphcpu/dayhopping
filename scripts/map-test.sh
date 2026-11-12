#!/usr/bin/env bash
# Meldet sich mit dem Testkonto an, öffnet den Test-Hop und prüft die Karte.
set -u
PKG="${APP_IDENTIFIER:-de.dayhop.app}"
APK=$(ls android/app/build/outputs/apk/release/*.apk | head -1)
UI="python3 scripts/ui.py"
mkdir -p smoke
adb wait-for-device
adb install -r "$APK" || { echo "KARTE: INSTALLATION FEHLGESCHLAGEN"; exit 0; }
adb logcat -c
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 15
$UI tap "du@beispiel.de" && adb shell input text "$TEST_EMAIL"
$UI tap "Mindestens 6 Zeichen" && adb shell input text "$TEST_PASSWORD"
adb shell input keyevent 111   # Tastatur schließen
sleep 1
$UI tap "^Anmelden$" --last
sleep 8
$UI tap "(?i)^(allow|zulassen|erlauben)$" || true   # Benachrichtigungen
sleep 2
$UI tap "Kartentest" --last
sleep 25
echo "----- Bildschirmtexte -----"; $UI dump | head -40
adb exec-out screencap -p > smoke/karte.png
adb logcat -d -v brief > smoke/karte-logcat.txt
echo "----- Kartenprotokoll -----"
grep -iE "maps|API_KEY|Authorization|gms.*map|zzc|DynamiteModule|FATAL|ReactNativeJS" smoke/karte-logcat.txt | grep -viE "mapbox|gmscompliance" | head -80
echo "----- Ende Kartenprotokoll -----"
echo "KARTE_BASE64_START"; base64 -w 0 smoke/karte.png; echo; echo "KARTE_BASE64_ENDE"
exit 0
