#!/usr/bin/env bash
# Installiert die APK im Emulator, startet sie und prüft, ob sie nach 30 s noch läuft.
# Gibt Absturzmeldungen und (base64) einen Screenshot ins Protokoll aus.
set -u
PKG="${APP_IDENTIFIER:-de.dayhop.app}"
APK=$(ls android/app/build/outputs/apk/release/*.apk | head -1)
mkdir -p smoke
adb wait-for-device
adb shell settings put global window_animation_scale 0
adb install -r -g "$APK" || { echo "SMOKE: INSTALLATION FEHLGESCHLAGEN"; exit 1; }
adb logcat -c
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 30
adb exec-out screencap -p > smoke/start.png
adb logcat -d -v brief > smoke/logcat.txt
if adb shell pidof "$PKG" >/dev/null; then echo "SMOKE: APP LÄUFT"; else echo "SMOKE: APP NICHT MEHR AKTIV"; fi
echo "----- Fehler im Protokoll -----"
grep -E "FATAL|AndroidRuntime|ReactNativeJS|ReactNative|Exception|Error|expo" smoke/logcat.txt | grep -v "^D/" | head -150
echo "----- Ende -----"
echo "SCREENSHOT_BASE64_START"
base64 -w 0 smoke/start.png; echo
echo "SCREENSHOT_BASE64_ENDE"
exit 0
