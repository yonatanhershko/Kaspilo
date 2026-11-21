import { leafPalette } from '@kaspilo/tokens';
import { StyleSheet, View } from 'react-native';

import { useTabBarHeight } from '@/components/ui/TabBarHeight';
import { useTheme } from '@/theme/ThemeProvider';

import { Leaf } from './Leaf';
import { TopLeaves } from './TopLeaves';
import { LeafCluster } from './LeafCluster';
import { Sway } from './Sway';

/**
 * Leaf decoration behind a screen's content. Kept sparse on purpose.
 * Never takes touches and is hidden from screen readers.
 *   low    - one small bottom corner cluster (dense screens: lists, forms)
 *   medium - two small bottom corner clusters (home, stats, goals)
 *   high   - the two clusters + two drifting 3D leaves (auth, locked, empty states)
 */
export type LeafDensity = 'low' | 'medium' | 'high';

const drifting: { left: `${number}%`; top: `${number}%`; size: number; rotate: number; color: number; duration: number; delay: number }[] = [
  { left: '84%', top: '10%', size: 24, rotate: -40, color: 5, duration: 3300, delay: 0 },
  { left: '6%', top: '82%', size: 20, rotate: 60, color: 4, duration: 3000, delay: 600 },
];

export function LeafBackground({
  density = 'medium',
  topCorner = false,
}: {
  density?: LeafDensity;
  /** One small cluster in the top corner opposite the header controls (home). */
  topCorner?: boolean;
}) {
  const { theme } = useTheme();
  // On tab screens the bar covers the bottom edge: lift the corner leaves so they peek out above it.
  const tabBar = useTabBarHeight();
  const lift = tabBar ? { bottom: tabBar - 12 } : null;
  const opacity = theme === 'dark' ? 0.5 : 0.85;
  // The layout never mirrors, so the art sits on fixed physical sides.
  const at = (side: 'start' | 'end', inset: number) => (side === 'start' ? { left: inset } : { right: inset });
  // The home bell sits in the physical top-left, so the leaves go there too.
  const physicalLeft = { left: 0 };

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.layer, { opacity }]}>
      <View style={[styles.bottom, lift, at('start', -22), { transform: [{ scaleX: 1 }] }]}>
        <LeafCluster size={density === 'low' ? 84 : 104} />
      </View>
      {density !== 'low' && (
        <View style={[styles.bottom, lift, at('end', -22), { transform: [{ scaleX: -1 }] }]}>
          <LeafCluster size={88} />
        </View>
      )}
      {topCorner && (
        <View style={[styles.top, physicalLeft]}>
          <TopLeaves size={120} />
        </View>
      )}
      {density === 'high' &&
        drifting.map((leaf) => (
          <Sway
            key={`${leaf.left}-${leaf.top}`}
            rotateY={50}
            rotateX={24}
            tilt={12}
            baseRotate={leaf.rotate}
            bob={7}
            duration={leaf.duration}
            delay={leaf.delay}
            style={{ position: 'absolute', left: leaf.left, top: leaf.top }}>
            <Leaf size={leaf.size} color={leafPalette[leaf.color]} />
          </Sway>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { overflow: 'hidden' },
  bottom: { position: 'absolute', bottom: -14 },
  top: { position: 'absolute', top: 0 },
});
