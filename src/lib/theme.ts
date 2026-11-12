import { Platform, useColorScheme, type ViewStyle } from 'react-native';

// Neutrale, kühle Basis. Der Akzent (Ultraviolett) ist reserviert für:
// Haupt-Buttons, aktive Navigation, wichtige Hervorhebungen/Badges und Fokusränder.
// Grün, Rot und Bernstein sind reine Zustandsfarben (erledigt, Fehler, Warnung).
const light = {
  bg: '#F3F4F7',
  card: '#FFFFFF',
  sunken: '#E9EBF0',
  ink: '#151821',
  muted: '#667085',
  line: '#DDE1E8',
  accent: '#5B3DF5',
  accentSoft: '#ECE8FF',
  onAccent: '#FFFFFF',
  teal: '#0E9F6E',
  tealSoft: '#E3F6EE',
  sun: '#F2B233',
  sunSoft: '#FDF3DC',
  danger: '#D92D20',
  bubbleMine: '#151821',
  bubbleOther: '#FFFFFF',
  shadow: '#101828',
};

const dark: typeof light = {
  bg: '#12151C',
  card: '#1B1F29',
  sunken: '#242936',
  ink: '#F2F4F7',
  muted: '#98A2B3',
  line: '#2E3442',
  accent: '#8B74FF',
  accentSoft: '#2A2450',
  onAccent: '#FFFFFF',
  teal: '#3CCB97',
  tealSoft: '#15322A',
  sun: '#F5C451',
  sunSoft: '#3A3016',
  danger: '#FF6B5E',
  bubbleMine: '#F2F4F7',
  bubbleOther: '#242936',
  shadow: '#000000',
};

export type Colors = typeof light;

export const fonts = { display: 'BricolageGrotesque_700Bold', displayHeavy: 'BricolageGrotesque_800ExtraBold' };
export const radius = { s: 12, m: 16, l: 22, pill: 999 };
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 36 };

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Weicher, großflächiger Schatten für Karten und schwebende Elemente */
export function softShadow(c: Colors, level: 1 | 2 = 1): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: { shadowColor: c.shadow, shadowOpacity: level === 1 ? 0.06 : 0.14, shadowRadius: level === 1 ? 14 : 22, shadowOffset: { width: 0, height: level === 1 ? 4 : 10 } },
    default: { elevation: level === 1 ? 2 : 8, shadowColor: c.shadow },
  })!;
}

export const BRAND = '#5B3DF5';
export const AVATAR_COLORS = ['#5B3DF5', '#0E9F6E', '#E8590C', '#D9860B', '#D6336C', '#2F6FDE', '#3D8B37', '#7C3AED'];
