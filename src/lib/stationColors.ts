// Einheitlicher Check-in-Radius aller Stationen in Metern
export const STATION_RADIUS_M = 60;

// Leuchtfarben für Stationen. Innerhalb eines Hops ist jede Farbe nur einmal vergeben.
export const STATION_COLORS: { hex: string; name: string }[] = [
  { hex: '#FF3B30', name: 'Rot' },
  { hex: '#FF9500', name: 'Orange' },
  { hex: '#FFCC00', name: 'Gelb' },
  { hex: '#A8E10C', name: 'Limette' },
  { hex: '#34C759', name: 'Grün' },
  { hex: '#00C7BE', name: 'Türkis' },
  { hex: '#32ADE6', name: 'Himmelblau' },
  { hex: '#007AFF', name: 'Blau' },
  { hex: '#5856D6', name: 'Indigo' },
  { hex: '#AF52DE', name: 'Violett' },
  { hex: '#FF2D92', name: 'Pink' },
  { hex: '#A2845E', name: 'Braun' },
];

// Regenbogen für die Leuchtringe: je mehr Leute eingecheckt sind, desto mehr Farben
export const RAINBOW = ['#FF1E1E', '#FF8A00', '#FFE000', '#22D34A', '#00A3FF', '#4B3BFF', '#C03BFF'];

/** Farbe einer Station; ältere Stationen ohne Farbe bekommen eine nach ihrer Position. */
export function stationColor(s: { color: string | null }, index: number): string {
  return s.color ?? STATION_COLORS[index % STATION_COLORS.length].hex;
}

/** "#RRGGBB" + Deckkraft 0–1 → "rgba(...)" */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

/** Wie stark eine Station leuchtet, abhängig von der Zahl der Eingecheckten (0 = ruhig). */
export function glowLevel(present: number) {
  const n = Math.min(present, 10);
  return {
    markerSize: n === 0 ? 34 : Math.min(34 + 7 * n, 76),
    scale: 1 + 0.18 * n, // Leuchtradius relativ zum Check-in-Radius
    amplitude: n === 0 ? 0 : Math.min(0.1 + 0.05 * n, 0.45), // wie weit es wabert
    periodMs: n === 0 ? 0 : Math.max(2400 - 180 * n, 900), // wie schnell es wabert
    fillAlpha: n === 0 ? 0 : Math.min(0.18 + 0.07 * n, 0.6), // Farbintensität
    rings: Math.min(n, RAINBOW.length), // Regenbogenringe
  };
}
