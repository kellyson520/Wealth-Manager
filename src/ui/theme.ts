import { Platform, ViewStyle } from 'react-native';

export const colors = {
  bg: '#101312',
  bgAlt: '#121817',
  surface: '#171D1B',
  surfaceRaised: '#1E2724',
  surfaceSoft: '#24302B',
  border: '#2C3934',
  borderStrong: '#3B4A43',
  text: '#F3F6F2',
  textMuted: '#AAB5AE',
  textSubtle: '#78847E',
  accent: '#2DD4BF',
  accentStrong: '#14B8A6',
  accentSoft: 'rgba(45,212,191,0.14)',
  income: '#45C486',
  incomeSoft: 'rgba(69,196,134,0.14)',
  expense: '#F97373',
  expenseSoft: 'rgba(249,115,115,0.14)',
  warning: '#F6C85F',
  warningSoft: 'rgba(246,200,95,0.16)',
  danger: '#EF4444',
  dangerSoft: 'rgba(239,68,68,0.16)',
  info: '#7CA7FF',
  infoSoft: 'rgba(124,167,255,0.15)',
  purple: '#B69CFF',
  purpleSoft: 'rgba(182,156,255,0.14)',
  white: '#FFFFFF',
};

export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const shadow = {
  shadowColor: '#000',
  shadowOpacity: Platform.OS === 'ios' ? 0.22 : 0.18,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
} satisfies ViewStyle;
