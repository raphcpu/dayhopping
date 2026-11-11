import { useColorScheme } from 'react-native';

const light = {
  bg: '#FBF6EE',
  card: '#FFFFFF',
  sunken: '#F2EADD',
  ink: '#1E1B16',
  muted: '#7B7265',
  line: '#E7DDCD',
  accent: '#FF5A36',
  accentSoft: '#FFE6DE',
  onAccent: '#FFFFFF',
  teal: '#0E7C72',
  tealSoft: '#DDF1EE',
  sun: '#FFC83D',
  sunSoft: '#FFF3CF',
  danger: '#C62F2F',
  bubbleMine: '#FF5A36',
  bubbleOther: '#FFFFFF',
};

const dark: typeof light = {
  bg: '#15130F',
  card: '#211E18',
  sunken: '#1B1914',
  ink: '#F6F0E6',
  muted: '#A39A8B',
  line: '#35302A',
  accent: '#FF6B4A',
  accentSoft: '#44211A',
  onAccent: '#FFFFFF',
  teal: '#39B5A8',
  tealSoft: '#15332F',
  sun: '#FFC83D',
  sunSoft: '#3D3211',
  danger: '#FF7B7B',
  bubbleMine: '#FF6B4A',
  bubbleOther: '#2A2620',
};

export type Colors = typeof light;

export const fonts = { display: 'BricolageGrotesque_700Bold', displayHeavy: 'BricolageGrotesque_800ExtraBold' };
export const radius = { s: 10, m: 16, l: 24, pill: 999 };
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const AVATAR_COLORS = ['#FF5A36', '#0E7C72', '#7A4CE0', '#D9860B', '#D6336C', '#2F6FDE', '#3D8B37', '#B5471B'];
