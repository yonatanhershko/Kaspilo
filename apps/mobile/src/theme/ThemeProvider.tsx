import { colors, type ColorToken, type ThemeName } from '@kaspilo/tokens';
import { vars } from 'nativewind';
import { createContext, type ReactNode, use, useState } from 'react';
import { useColorScheme, View } from 'react-native';

import { saveThemePreference, type ThemePreference } from '@/lib/preferences';

type ThemeContextValue = {
  /** What is on screen now. */
  theme: ThemeName;
  /** What the user picked: follow the phone, or force one. */
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
  /** Raw hex values, for places that cannot take a class name (SVG fills, charts). */
  colors: Record<ColorToken, string>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function hexToRgbTriplet(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function buildVars(name: ThemeName) {
  const entries = Object.entries(colors[name]).map(([key, hex]) => [
    `--color-${kebab(key)}`,
    hexToRgbTriplet(hex),
  ]);
  return vars(Object.fromEntries(entries));
}

const themeVars = { light: buildVars('light'), dark: buildVars('dark') };

export function ThemeProvider({
  initialPreference,
  children,
}: {
  initialPreference: ThemePreference;
  children: ReactNode;
}) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState(initialPreference);

  const theme: ThemeName =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  const setPreference = (value: ThemePreference) => {
    setPreferenceState(value);
    void saveThemePreference(value);
  };

  return (
    <ThemeContext value={{ theme, preference, setPreference, colors: colors[theme] }}>
      <View style={[{ flex: 1 }, themeVars[theme]]}>{children}</View>
    </ThemeContext>
  );
}

export function useTheme(): ThemeContextValue {
  const value = use(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
