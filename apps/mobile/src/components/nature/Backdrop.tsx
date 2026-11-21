import { backdrop, backdropVariant, colors, type ThemeName } from '@kaspilo/tokens';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * Soft blurred background: the theme's secondary and primary with a white
 * glow, like a blurred mesh gradient. Static, never takes touches.
 * Takes the theme by name so it also works before the theme provider exists.
 */
type Blob = { id: string; cx: number; cy: number; r: number; color: string; opacity: number };

export function Backdrop({ theme }: { theme: ThemeName }) {
  const c = colors[theme];
  const b = backdrop[theme];
  const blobs: Blob[] =
    backdropVariant === 'a'
      ? [
          { id: 'sec', cx: 0.5, cy: 0.55, r: 0.95, color: c.secondary, opacity: b.secondaryOpacity },
          { id: 'priA', cx: 0.62, cy: 0.38, r: 0.5, color: c.primary, opacity: b.primaryOpacity },
          { id: 'priB', cx: 0.4, cy: 1, r: 0.5, color: c.primary, opacity: b.primaryOpacity },
          { id: 'glowA', cx: 0, cy: 0, r: 0.7, color: b.glow, opacity: b.glowOpacity },
          { id: 'glowB', cx: 1, cy: 0.78, r: 0.55, color: b.glow, opacity: b.glowOpacity },
        ]
      : [
          // Diagonal sweep: white top-right and bottom-left, green band between.
          { id: 'sec', cx: 0.5, cy: 0.5, r: 1.05, color: c.secondary, opacity: b.secondaryOpacity },
          { id: 'priA', cx: 0.15, cy: 0.3, r: 0.55, color: c.primary, opacity: b.primaryOpacity },
          { id: 'priB', cx: 0.85, cy: 0.72, r: 0.55, color: c.primary, opacity: b.primaryOpacity },
          { id: 'glowA', cx: 1, cy: 0, r: 0.8, color: b.glow, opacity: b.glowOpacity },
          { id: 'glowB', cx: 0, cy: 1, r: 0.75, color: b.glow, opacity: b.glowOpacity },
        ];
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { backgroundColor: b.base }]}>
      <Svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">
        <Defs>
          {blobs.map((blob) => (
            <RadialGradient
              key={blob.id}
              id={blob.id}
              cx={blob.cx}
              cy={blob.cy}
              r={blob.r}
              gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={blob.color} stopOpacity={blob.opacity} />
              <Stop offset="1" stopColor={blob.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {blobs.map((blob) => (
          <Rect key={blob.id} x={0} y={0} width={1} height={1} fill={`url(#${blob.id})`} />
        ))}
      </Svg>
    </View>
  );
}
