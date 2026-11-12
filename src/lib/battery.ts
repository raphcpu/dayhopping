// Android-Akku-Optimierung: Ist sie für DayHop an, beendet Android die Hintergrund-Ortung
// oft nach einigen Minuten (besonders Samsung, Xiaomi, Huawei).
import * as Battery from 'expo-battery';
import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';

const PACKAGE = Constants.expoConfig?.android?.package ?? 'de.dayhop.app';

/** true = Android bremst DayHop im Hintergrund; auf iOS immer false */
export function useBatteryOptimized(): { optimized: boolean; disable: () => Promise<void> } {
  const [optimized, setOptimized] = useState(false);

  const check = useCallback(() => {
    if (Platform.OS !== 'android') return;
    Battery.isBatteryOptimizationEnabledAsync().then(setOptimized).catch(() => {});
  }, []);

  useEffect(() => {
    check();
    // nach der Rückkehr aus dem Systemdialog neu prüfen
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, [check]);

  const disable = useCallback(async () => {
    try {
      // Direkter Systemdialog „Akku-Optimierung ignorieren?“
      await IntentLauncher.startActivityAsync('android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', { data: `package:${PACKAGE}` });
    } catch {
      try {
        // Manche Hersteller blockieren den Dialog: dann die Liste der Akku-Einstellungen
        await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
      } catch {
        await Linking.openSettings();
      }
    }
    check();
  }, [check]);

  return { optimized, disable };
}
