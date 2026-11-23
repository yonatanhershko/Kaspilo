/**
 * Kaspilo global style. One source for mobile (NativeWind) and web (Tailwind).
 * Change a value here, both apps follow.
 */

export const colors = {
  light: {
    primary: '#4A7C6F',
    onPrimary: '#FFFFFF',
    secondary: '#A8C5B4',
    background: '#F5F1E8',
    surface: '#FFFFFF',
    surfaceMuted: '#EFEADF',
    accent: '#E8A87C',
    onAccent: '#4A2A12',
    text: '#2E3D38',
    textMuted: '#485751',
    border: '#E4DFD2',
    danger: '#D64545',
    dangerSurface: '#FCEBEB',
    success: '#3E8E5A',
    leafLight: '#CFE0D3',
    leafMid: '#A8C5B4',
    leafDark: '#4A7C6F',
  },
  dark: {
    primary: '#7FBCA3',
    onPrimary: '#10201A',
    secondary: '#3D6B58',
    background: '#16211C',
    surface: '#1F2D27',
    surfaceMuted: '#263830',
    accent: '#E8A87C',
    onAccent: '#3A200D',
    text: '#E9F0EA',
    textMuted: '#B4C6BC',
    border: '#2F4239',
    danger: '#F07C7C',
    dangerSurface: '#3A1F1F',
    success: '#7FCB98',
    leafLight: '#2C4439',
    leafMid: '#3D6B58',
    leafDark: '#7FBCA3',
  },
} as const;

export type ThemeName = keyof typeof colors;
export type ColorToken = keyof (typeof colors)['light'];

/**
 * Soft blurred background: the theme's primary + secondary and a white glow.
 * `base` is the flat color under the blobs. Strengths are tuned so text and
 * muted text keep 4.5:1 on the darkest (light) / lightest (dark) spot.
 */
export const backdrop = {
  light: {
    base: '#E6F0E9',
    glow: '#FFFFFF',
    glowOpacity: 0.95,
    secondaryOpacity: 0.55,
    primaryOpacity: 0.18,
  },
  dark: {
    base: '#16211C',
    glow: '#E9F0EA',
    glowOpacity: 0.1,
    secondaryOpacity: 0.5,
    primaryOpacity: 0.12,
  },
} as const;

/** Which blob layout the background uses: 'a' (soft mesh) or 'b' (diagonal sweep). */
export const backdropVariant: 'a' | 'b' = 'b';

/** Colors for category icons and chart slices. Same in both themes. */
export const categoryPalette = [
  '#5B9BD5',
  '#E8A87C',
  '#F2C94C',
  '#4A7C6F',
  '#9B8AD6',
  '#E07A8B',
  '#6FB7B0',
  '#B58A5A',
  '#8FBF6B',
  '#8A9099',
] as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const fontFamily = {
  regular: 'Rubik_400Regular',
  medium: 'Rubik_500Medium',
  bold: 'Rubik_700Bold',
} as const;

export const fontSize = {
  caption: 12,
  body: 15,
  title: 18,
  heading: 24,
  hero: 36,
} as const;

/** Greens used by leaf artwork, darkest to lightest. Taken from the owner's SVGs. */
export const leafPalette = [
  '#245C47',
  '#2A6B52',
  '#2F7D5B',
  '#3A8A66',
  '#4C9A76',
  '#5BA37F',
  '#6FB28F',
] as const;

/** Colors of the wallet illustration. */
export const walletPalette = {
  body: '#245C47',
  flap: '#2F7D5B',
  stitch: '#3A8A66',
  clasp: '#1D4D3B',
  coin: '#F2C14E',
  coinCenter: '#E5A92E',
  cardGreen: '#7DB892',
  cardPeach: '#F6B88A',
} as const;

/** The onboarding sprout (docs/spec.md "Onboarding"): soil, leaf vein and blossoms. Same in both themes. */
export const plantPalette = {
  soil: '#E4D9C3',
  soilDark: '#CDBE9F',
  stem: '#3A8A66',
  vein: '#D5EADD',
  petal: '#E8A87C',
  petalLight: '#F6B88A',
  heart: '#F2C14E',
} as const;
