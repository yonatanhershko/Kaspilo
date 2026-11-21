import { type ReactNode } from 'react';
import Animated, { Easing, withDelay, withTiming } from 'react-native-reanimated';

/** Each card's own fade-and-rise. */
export const STAGGER_ITEM_MS = 450;
/** Start of one card to the next. */
const STAGGER_GAP_MS = 100;
/** The whole list is in by then: with many cards the gap shrinks. */
const STAGGER_TOTAL_MS = 1000;

/** Delay of card `index` out of `count`, so the last one ends within the total. */
export function staggerDelay(index: number, count: number): number {
  const gap = count > 1 ? Math.min(STAGGER_GAP_MS, (STAGGER_TOTAL_MS - STAGGER_ITEM_MS) / (count - 1)) : 0;
  return index * gap;
}

function rise(delay: number) {
  return () => {
    'worklet';
    const timing = { duration: STAGGER_ITEM_MS, easing: Easing.out(Easing.cubic) };
    return {
      initialValues: { opacity: 0, transform: [{ translateY: 12 }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, timing)),
        transform: [{ translateY: withDelay(delay, withTiming(0, timing)) }],
      },
    };
  };
}

/**
 * One card of a list that comes in one after another (docs/spec.md, home cards intro).
 * `play` false shows it at once.
 */
export function StaggerIn({
  index,
  count,
  play,
  children,
}: {
  index: number;
  count: number;
  play: boolean;
  children: ReactNode;
}) {
  return <Animated.View entering={play ? rise(staggerDelay(index, count)) : undefined}>{children}</Animated.View>;
}
