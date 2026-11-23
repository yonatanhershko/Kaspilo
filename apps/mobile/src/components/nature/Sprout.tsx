import { leafPalette, plantPalette } from '@kaspilo/tokens';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
  type WithTimingConfig,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

/**
 * The onboarding plant (docs/spec.md "Onboarding"), drawn from the approved canvas.
 * `growth` 0–5: seed, sprout, leaves, more leaves, branches with buds, blossoms. Moving to a
 * higher stage draws the stem up and pops the new leaves in; the plant then sways slowly.
 * Reduce motion: no growth animation and no sway, the plant just shows its stage.
 * Decorative: hidden from screen readers.
 */

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const STEM = 'M110 262 C 104 220, 118 180, 110 140 C 103 105, 116 80, 110 58';
const STEM_LENGTH = 230;
const STEM_SHOWN = [0.18, 0.38, 0.55, 0.72, 0.9, 1];

// x, y, rotate, scale, leafPalette index, shown from growth
const LEAVES: [number, number, number, number, number, number][] = [
  [110, 234, -58, 0.26, 6, 0],
  [110, 234, 58, 0.24, 5, 0],
  [109, 202, -62, 0.42, 4, 1],
  [111, 190, 58, 0.46, 3, 1],
  [111, 162, -58, 0.52, 2, 2],
  [110, 150, 62, 0.5, 3, 2],
  [107, 124, -52, 0.48, 1, 3],
  [112, 114, 54, 0.46, 2, 3],
  [86, 133, -100, 0.28, 4, 4],
  [136, 111, 100, 0.28, 5, 4],
  [110, 84, -34, 0.38, 0, 4],
  [110, 84, 34, 0.36, 2, 4],
];

const BRANCHES = ['M110 150 C 95 140, 82 132, 70 116', 'M110 128 C 125 118, 138 110, 150 96'];
const BRANCH_LENGTH = 60;

// x, y, delay; the top flower is bigger and only comes at the last stage.
const FLOWERS: { x: number; y: number; delay: number; top: boolean }[] = [
  { x: 70, y: 114, delay: 900, top: false },
  { x: 150, y: 94, delay: 1050, top: false },
  { x: 110, y: 54, delay: 800, top: true },
];

const POP = Easing.bezier(0.34, 1.56, 0.64, 1);
const EASE_OUT = Easing.out(Easing.cubic);

/** Animate to `target` (instantly under reduce motion). */
function useTo(
  target: number,
  duration: number,
  delay: number,
  easing: WithTimingConfig['easing'] = EASE_OUT,
) {
  const reduceMotion = useReducedMotion();
  const value = useSharedValue(target);
  useEffect(() => {
    value.value = reduceMotion ? target : withDelay(delay, withTiming(target, { duration, easing }));
  }, [target, duration, delay, easing, reduceMotion, value]);
  return value;
}

/** The leaf of the app's leaf art, scaled from its base: k = 0 → nothing, 1 → full size. */
function leafPaths(k: number) {
  'worklet';
  const p = (n: number) => (n * k).toFixed(2);
  return {
    body: `M0 0 C ${p(-24)} ${p(-22)} ${p(-30)} ${p(-68)} ${p(3)} ${p(-100)} C ${p(31)} ${p(-66)} ${p(25)} ${p(-22)} 0 0Z`,
    shine: `M0 0 C ${p(25)} ${p(-22)} ${p(31)} ${p(-66)} ${p(3)} ${p(-100)} Z`,
    vein: `M0 0 C ${p(1)} ${p(-30)} ${p(2)} ${p(-60)} ${p(3)} ${p(-90)}`,
  };
}

function SproutLeaf({ x, y, rotate, scale, color, shown, order }: {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  color: string;
  shown: boolean;
  order: number;
}) {
  const k = useTo(shown ? scale : 0, 750, shown ? 450 + order * 140 : 0, shown ? POP : undefined);
  const body = useAnimatedProps(() => ({ d: leafPaths(Math.max(0, k.value)).body }));
  const shine = useAnimatedProps(() => ({ d: leafPaths(Math.max(0, k.value)).shine }));
  const vein = useAnimatedProps(() => ({ d: leafPaths(Math.max(0, k.value)).vein }));
  return (
    <G transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <AnimatedPath animatedProps={body} fill={color} />
      <AnimatedPath animatedProps={shine} fill="#FFFFFF" opacity={0.16} />
      <AnimatedPath
        animatedProps={vein}
        fill="none"
        stroke={plantPalette.vein}
        strokeWidth={2.4}
        strokeLinecap="round"
        opacity={0.8}
      />
    </G>
  );
}

function Petal({ k, angle, color }: { k: SharedValue<number>; angle: number; color: string }) {
  const props = useAnimatedProps(() => {
    const s = Math.max(0, k.value);
    return { cy: -8 * s, rx: 5.5 * s, ry: 8.5 * s };
  });
  return <AnimatedEllipse animatedProps={props} cx={0} fill={color} transform={`rotate(${angle})`} />;
}

function Flower({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  const k = useTo(size, 900, size > 0 ? delay : 0, size > 0 ? POP : undefined);
  const heart = useAnimatedProps(() => ({ r: 4.5 * Math.max(0, k.value) }));
  return (
    <G transform={`translate(${x} ${y})`}>
      {[0, 72, 144, 216, 288].map((angle, i) => (
        <Petal key={angle} k={k} angle={angle} color={i % 2 === 0 ? plantPalette.petal : plantPalette.petalLight} />
      ))}
      <AnimatedCircle animatedProps={heart} cx={0} cy={0} fill={plantPalette.heart} />
    </G>
  );
}

function Stroke({ d, length, shown, width, duration, delay }: {
  d: string;
  length: number;
  shown: number;
  width: number;
  duration: number;
  delay: number;
}) {
  const offset = useTo(length * (1 - shown), duration, delay);
  const props = useAnimatedProps(() => ({ strokeDashoffset: offset.value }));
  return (
    <AnimatedPath
      d={d}
      animatedProps={props}
      fill="none"
      stroke={plantPalette.stem}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={`${length}`}
    />
  );
}

export function Sprout({ growth, size = 216 }: { growth: number; size?: number }) {
  const g = Math.max(0, Math.min(5, Math.round(growth)));
  const reduceMotion = useReducedMotion();

  // Slow sway, 3.4 s each way, from the base of the stem.
  const sway = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(sway);
      sway.value = 0;
      return;
    }
    sway.value = withRepeat(withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(sway);
  }, [reduceMotion, sway]);
  const swayStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-1.6 + 3.2 * sway.value}deg` }],
  }));

  const width = Math.round((size * 220) / 300);
  const counts: Record<number, number> = {};
  const bud = g >= 5 ? 1 : g >= 4 ? 0.35 : 0;

  return (
    <View
      style={{ width, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none">
      <Svg width={width} height={size} viewBox="0 0 220 300" style={{ position: 'absolute' }}>
        <Ellipse cx={110} cy={268} rx={78} ry={17} fill={plantPalette.soil} />
        <Ellipse cx={110} cy={264} rx={50} ry={9} fill={plantPalette.soilDark} />
      </Svg>
      <Animated.View
        style={[{ position: 'absolute', width, height: size, transformOrigin: `50% ${(262 / 300) * 100}%` }, swayStyle]}>
        <Svg width={width} height={size} viewBox="0 0 220 300">
          <Stroke d={STEM} length={STEM_LENGTH} shown={STEM_SHOWN[g]} width={5} duration={900} delay={0} />
          {BRANCHES.map((d) => (
            <Stroke key={d} d={d} length={BRANCH_LENGTH} shown={g >= 4 ? 1 : 0} width={3.5} duration={700} delay={300} />
          ))}
          {LEAVES.map(([x, y, rotate, scale, color, from]) => {
            const order = (counts[from] = (counts[from] ?? -1) + 1);
            return (
              <SproutLeaf
                key={`${x}-${y}-${rotate}`}
                x={x}
                y={y}
                rotate={rotate}
                scale={scale}
                color={leafPalette[color]}
                shown={g >= from}
                order={order}
              />
            );
          })}
          {FLOWERS.map((f) => (
            <Flower key={`${f.x}-${f.y}`} x={f.x} y={f.y} delay={f.delay} size={f.top ? (g >= 5 ? 1.35 : 0) : bud} />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}
