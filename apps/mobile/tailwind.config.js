/**
 * Color values come from @kaspilo/tokens at runtime as CSS variables
 * (see src/theme/ThemeProvider.tsx), so light / dark switch without a rebuild.
 * Keep this list in step with the color keys in packages/tokens/src/index.ts.
 */
const colorTokens = [
  'primary',
  'on-primary',
  'secondary',
  'background',
  'surface',
  'surface-muted',
  'accent',
  'on-accent',
  'text',
  'text-muted',
  'border',
  'danger',
  'danger-surface',
  'success',
  'leaf-light',
  'leaf-mid',
  'leaf-dark',
];

/** @type {import('tailwindcss').Config} */
module.exports = {
  // Theme is driven by CSS variables from ThemeProvider, not by the OS media query.
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: Object.fromEntries(
        colorTokens.map((name) => [name, `rgb(var(--color-${name}) / <alpha-value>)`]),
      ),
      fontFamily: {
        rubik: ['Rubik_400Regular'],
        'rubik-medium': ['Rubik_500Medium'],
        'rubik-bold': ['Rubik_700Bold'],
      },
      borderRadius: { sm: '8px', md: '12px', lg: '16px', xl: '24px' },
    },
  },
  plugins: [],
};
