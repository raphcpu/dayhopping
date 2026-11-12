// Web: keine Akku-Optimierung, die man abschalten könnte
export function useBatteryOptimized(): { optimized: boolean; disable: () => Promise<void> } {
  return { optimized: false, disable: async () => {} };
}
