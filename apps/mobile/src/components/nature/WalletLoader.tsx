import { walletPalette as c } from '@kaspilo/tokens';
import { type ReactNode, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

/** One loop: squeeze, both cards pop out and fan apart, bursts flash, cards slide back. */
const LOOP_MS = 2800;
/** The art is drawn in this box (the logo wallet plus room for the cards and bursts). */
const VIEW = { x: -20, y: -40, size: 260 };

type Keys = { at: number[]; values: number[] };
const squeezeX: Keys = { at: [0, 0.1, 0.22, 0.32, 0.72, 0.82, 1], values: [1, 1.05, 0.98, 1, 1, 1.02, 1] };
const squeezeY: Keys = { at: [0, 0.1, 0.22, 0.32, 0.72, 0.82, 1], values: [1, 0.9, 1.04, 1, 1, 0.97, 1] };
const popAt = [0, 0.08, 0.24, 0.34, 0.62, 0.8, 1];
const greenCard = { x: [0, 0, -16, -12, -12, 0, 0], y: [0, 0, -34, -28, -28, 0, 0], r: [0, 0, -14, -11, -11, 0, 0] };
const peachCard = { x: [0, 0, 16, 12, 12, 0, 0], y: [0, 0, -30, -25, -25, 0, 0], r: [0, 0, 13, 10, 10, 0, 0] };
const burstAt = [0, 0.12, 0.22, 0.4, 1];
const burstOpacity = [0, 0, 1, 0, 0];
const burstScale = [0.4, 0.4, 1, 1.25, 1.25];

function at(p: number, keys: Keys) {
  'worklet';
  return interpolate(p, keys.at, keys.values, Extrapolation.CLAMP);
}

/** Point of the art (in drawing units) as pixels inside the square layer. */
function px(x: number, y: number, k: number): [number, number, number] {
  return [(x - VIEW.x) * k, (y - VIEW.y) * k, 0];
}

function Layer({ size, children }: { size: number; children: ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.size} ${VIEW.size}`}>
      {children}
    </Svg>
  );
}

/**
 * Loading animation: the logo wallet is squeezed and its cards pop out and back.
 * Slow loop (2.8 s). With "reduce motion" the wallet stays still.
 * `width` is the wallet's own width; the drawing is a bit wider for the cards and bursts.
 */
export function WalletLoader({ width = 160, burstColor }: { width?: number; burstColor: string }) {
  const reduceMotion = useReducedMotion();
  const k = width / 220;
  const size = VIEW.size * k;
  const p = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    p.set(withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1, false));
  }, [reduceMotion, p]);

  const squeeze = useAnimatedStyle(() => ({
    transform: [{ scaleX: at(p.get(), squeezeX) }, { scaleY: at(p.get(), squeezeY) }],
  }));
  const green = useCardStyle(p, greenCard, k);
  const peach = useCardStyle(p, peachCard, k);
  const burst = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), burstAt, burstOpacity, Extrapolation.CLAMP),
    transform: [{ scale: interpolate(p.get(), burstAt, burstScale, Extrapolation.CLAMP) }],
  }));

  const layer = StyleSheet.absoluteFill;
  return (
    <View style={{ width: size, height: size }} accessible={false}>
      <View style={layer}>
        <Layer size={size}>
          <Ellipse cx={110} cy={219} rx={85} ry={9} fill="#000000" opacity={0.07} />
        </Layer>
      </View>

      {/* Everything that is squeezed: the cards ride along with the wallet. */}
      <Animated.View style={[layer, { transformOrigin: px(110, 212, k) }, squeeze]}>
        <Animated.View style={[layer, { transformOrigin: px(102, 101, k) }, green]}>
          <Layer size={size}>
            <Rect x={55} y={26} width={95} height={75} rx={11} fill={c.cardGreen} transform="rotate(-4 100 60)" />
          </Layer>
        </Animated.View>
        <Animated.View style={[layer, { transformOrigin: px(100, 115, k) }, peach]}>
          <Layer size={size}>
            <Rect x={48} y={40} width={105} height={75} rx={11} fill={c.cardPeach} transform="rotate(2 100 75)" />
            <Rect
              x={60}
              y={54}
              width={34}
              height={6}
              rx={3}
              fill="#FFFFFF"
              opacity={0.55}
              transform="rotate(2 77 57)"
            />
          </Layer>
        </Animated.View>
        <View style={layer}>
          <Layer size={size}>
            <Rect x={25} y={80} width={170} height={132} rx={20} fill={c.body} />
            <Path d="M25 100 a20 20 0 0 1 20 -20 H175 a20 20 0 0 1 20 20 V112 H25 Z" fill={c.flap} />
            <Path d="M33 118 H187" stroke={c.stitch} strokeWidth={2} strokeDasharray="5 5" opacity={0.6} />
            <Path
              d="M130 130 H182 a15 15 0 0 1 15 15 v26 a15 15 0 0 1 -15 15 H130 a28 28 0 0 1 -28 -28 a28 28 0 0 1 28 -28 Z"
              fill={c.clasp}
            />
            <Circle cx={160} cy={158} r={13} fill={c.coin} />
            <Circle cx={160} cy={158} r={5} fill={c.coinCenter} />
          </Layer>
        </View>
      </Animated.View>

      {/* Little burst marks on both sides when the cards pop. */}
      {!reduceMotion && (
        <>
          <Animated.View style={[layer, { transformOrigin: px(14, 64, k) }, burst]}>
            <Layer size={size}>
              <Path
                d="M14 40 L-2 30 M10 64 L-8 64 M14 88 L-2 98"
                stroke={burstColor}
                strokeWidth={6}
                strokeLinecap="round"
              />
            </Layer>
          </Animated.View>
          <Animated.View style={[layer, { transformOrigin: px(206, 64, k) }, burst]}>
            <Layer size={size}>
              <Path
                d="M206 40 L222 30 M210 64 L228 64 M206 88 L222 98"
                stroke={burstColor}
                strokeWidth={6}
                strokeLinecap="round"
              />
            </Layer>
          </Animated.View>
        </>
      )}
    </View>
  );
}

function useCardStyle(p: SharedValue<number>, keys: { x: number[]; y: number[]; r: number[] }, k: number) {
  return useAnimatedStyle(() => {
    const v = p.get();
    return {
      transform: [
        { translateX: interpolate(v, popAt, keys.x, Extrapolation.CLAMP) * k },
        { translateY: interpolate(v, popAt, keys.y, Extrapolation.CLAMP) * k },
        { rotate: `${interpolate(v, popAt, keys.r, Extrapolation.CLAMP)}deg` },
      ],
    };
  });
}
