import { leafPalette } from '@kaspilo/tokens';
import Svg, { G, Path } from 'react-native-svg';

/**
 * A fan of leaves growing out of a bottom-left corner, extended from the
 * owner's leaf-cluster-corner.svg (four leaves there, seven here).
 * Flip it with a parent transform for other corners.
 */
const leaves: { rotate: number; scale: number; color: string }[] = [
  { rotate: -128, scale: 0.62, color: leafPalette[6] },
  { rotate: -112, scale: 0.84, color: leafPalette[5] },
  { rotate: -84, scale: 1.2, color: leafPalette[2] },
  { rotate: -62, scale: 0.95, color: leafPalette[4] },
  { rotate: -40, scale: 1.35, color: leafPalette[3] },
  { rotate: -22, scale: 0.8, color: leafPalette[1] },
  { rotate: -6, scale: 1.1, color: leafPalette[0] },
];

export function LeafCluster({ size = 180 }: { size?: number }) {
  return (
    <Svg width={(size * 220) / 200} height={size} viewBox="0 0 220 200">
      {leaves.map((leaf) => (
        <G key={leaf.rotate} transform={`translate(20 195) rotate(${leaf.rotate}) scale(${leaf.scale})`}>
          <Path d="M0 0 C 15 -35 65 -40 100 0 C 65 40 15 35 0 0Z" fill={leaf.color} />
          <Path d="M0 0 C 15 -35 65 -40 100 0 Z" fill="#FFFFFF" opacity={0.1} />
          <Path d="M0 0 L88 0" stroke="#A9D1BC" strokeWidth={2} fill="none" />
        </G>
      ))}
    </Svg>
  );
}
