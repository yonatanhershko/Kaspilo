import { leafPalette } from '@kaspilo/tokens';
import Svg, { G, Path } from 'react-native-svg';

const leafBody = 'M0 0 C 26 -36 88 -38 132 0 C 88 38 26 36 0 0Z';

/**
 * Two big soft leaves hanging into the top-left corner, as in the owner's
 * home design. A darker leaf sits behind a paler one. Flip with a parent
 * transform for the other corner.
 */
export function TopLeaves({ size = 120 }: { size?: number }) {
  return (
    <Svg width={(size * 190) / 120} height={size} viewBox="0 0 190 120">
      <G transform="translate(20 -5) rotate(40) scale(0.58)">
        <Path d={leafBody} fill={leafPalette[4]} fillOpacity={0.75} />
      </G>
      <G transform="translate(-10 1) rotate(42) scale(0.82)">
        <Path d={leafBody} fill={leafPalette[6]} fillOpacity={0.4} />
      </G>
    </Svg>
  );
}
