import { useEffect, useState } from 'react';
import { Circle } from 'react-native-maps';
import { glowLevel, RAINBOW, withAlpha } from '@/lib/stationColors';

type Props = { lat: number; lng: number; radius: number; color: string; present: number; animate: boolean };

/**
 * Leuchten einer Station auf der Karte, sobald jemand eingecheckt ist:
 * Kern in der Stationsfarbe, darum Regenbogenringe. Je mehr Leute da sind, desto größer,
 * kräftiger, bunter und schneller wabert es. Gezeichnet mit nativen Kreisen der Karte
 * (läuft flüssiger als animierte Marker-Bilder).
 */
export function StationGlow({ lat, lng, radius, color, present, animate }: Props) {
  const g = glowLevel(present);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!animate || !g.periodMs) return;
    const start = Date.now();
    const id = setInterval(() => setPhase(((Date.now() - start) % g.periodMs) / g.periodMs), 100);
    return () => clearInterval(id);
  }, [animate, g.periodMs]);

  if (present <= 0) return null;
  const center = { latitude: lat, longitude: lng };
  const wave = Math.sin(phase * 2 * Math.PI);
  const core = radius * g.scale * (1 + g.amplitude * wave);

  return (
    <>
      {Array.from({ length: g.rings }, (_, i) => {
        const ring = core * (1 + 0.2 * (i + 1)) * (1 + g.amplitude * 0.6 * Math.sin(phase * 2 * Math.PI - (i + 1) * 0.75));
        return (
          <Circle key={`ring-${i}`} center={center} radius={ring} zIndex={2 + g.rings - i}
            strokeColor={withAlpha(RAINBOW[i], 0.55 + 0.35 * Math.min(1, present / 6))} strokeWidth={3 + Math.min(present, 5) * 0.5}
            fillColor={withAlpha(RAINBOW[i], 0.04 + 0.01 * Math.min(present, 6))} />
        );
      })}
      <Circle center={center} radius={core} zIndex={20}
        strokeColor={withAlpha(color, 0.95)} strokeWidth={2.5}
        fillColor={withAlpha(color, g.fillAlpha * (0.85 + 0.15 * wave))} />
    </>
  );
}
