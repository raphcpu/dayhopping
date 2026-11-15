import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import { View } from 'react-native';

/**
 * QR-Code ohne Zusatzmodule: aus Views gezeichnet (läuft in App und Browser).
 * Dunkle Felder einer Zeile werden zu Streifen zusammengefasst, das hält es schlank.
 */
export function QrCode({ value, size = 220, color = '#151821', background = '#FFFFFF' }: { value: string; size?: number; color?: string; background?: string }) {
  const rows = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    const out: { y: number; runs: [number, number][] }[] = [];
    for (let y = 0; y < n; y++) {
      const runs: [number, number][] = [];
      let start = -1;
      for (let x = 0; x <= n; x++) {
        const dark = x < n && qr.isDark(y, x);
        if (dark && start < 0) start = x;
        if (!dark && start >= 0) {
          runs.push([start, x - start]);
          start = -1;
        }
      }
      out.push({ y, runs });
    }
    return { n, out };
  }, [value]);

  const quiet = 4; // Ruhezone, damit Kameras den Code sicher erkennen
  const cell = size / (rows.n + quiet * 2);
  return (
    <View accessibilityRole="image" accessibilityLabel="QR-Code zum Beitreten"
      style={{ width: size, height: size, backgroundColor: background, borderRadius: 12 }}>
      {rows.out.map(({ y, runs }) =>
        runs.map(([x, len]) => (
          <View key={`${y}-${x}`} style={{ position: 'absolute', left: (x + quiet) * cell, top: (y + quiet) * cell, width: len * cell + 0.5, height: cell + 0.5, backgroundColor: color }} />
        )),
      )}
    </View>
  );
}
