/**
 * A one-off confetti burst for finishing the last task of the day. Runs on the UI thread with Reanimated,
 * never blocks touches, and draws nothing when the phone's Reduce motion setting is on.
 */
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { colors } from '@dirary/ui';

const LIFE_MS = 2400;
const GRAVITY = 1500; // px/s²
const DRAG = 1.9; // per second
const PALETTE = [colors.inkBlue, colors.tongue, colors.amber, colors.text, colors.red];

interface Bit { x: number; y: number; vx: number; vy: number; spin: number; angle: number; flip: number; w: number; h: number; round: boolean; color: string; delay: number }

function makeBits(x: number, y: number, width: number): Bit[] {
  const bits: Bit[] = [];
  const burst = (ox: number, count: number, from: number, to: number, slow: number, fast: number, delay: number) => {
    for (let i = 0; i < count; i++) {
      const a = ((from + Math.random() * (to - from)) * Math.PI) / 180;
      const v = slow + Math.random() * (fast - slow);
      const size = 6 + Math.random() * 5;
      const kind = Math.random();
      bits.push({
        x: ox, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, spin: (Math.random() - 0.5) * 14, angle: Math.random() * 180, flip: 4 + Math.random() * 8,
        w: kind < 0.2 ? 3 : size, h: kind < 0.2 ? size * 2 : kind < 0.45 ? size : size * 0.7, round: kind >= 0.2 && kind < 0.45,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)]!, delay,
      });
    }
  };
  // One big burst up and out of the progress bar, then two smaller pops from its ends.
  burst(x, 70, -165, -15, 450, 1150, 0);
  burst(x - width / 2, 25, -120, -60, 400, 900, 140);
  burst(x + width / 2, 25, -120, -60, 400, 900, 140);
  return bits;
}

function Piece({ bit, clock }: { bit: Bit; clock: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = Math.max(0, clock.value - bit.delay) / 1000;
    // Linear drag towards a terminal fall speed: a quick explosion that slows and drifts down.
    const decay = (1 - Math.exp(-DRAG * t)) / DRAG;
    const x = bit.vx * decay;
    const y = (bit.vy - GRAVITY / DRAG) * decay + (GRAVITY / DRAG) * t;
    const life = clock.value / LIFE_MS;
    return {
      opacity: clock.value < bit.delay ? 0 : life > 0.75 ? Math.max(0, (1 - life) / 0.25) : 1,
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${bit.angle + bit.spin * t * 57.3}deg` }, { scaleY: Math.cos(bit.flip * t) }],
    };
  });
  return (
    <Animated.View
      style={[{ position: 'absolute', left: bit.x - bit.w / 2, top: bit.y - bit.h / 2, width: bit.w, height: bit.h, borderRadius: bit.round ? bit.w / 2 : 1.5, backgroundColor: bit.color }, style]}
    />
  );
}

/** Renders a burst centred on `origin` (in this view's coordinates) each time `shot` changes to a new number above 0. */
export function Confetti({ shot, origin }: { shot: number; origin: { x: number; y: number; width: number } | null }) {
  const reduced = useReducedMotion();
  const clock = useSharedValue(0);
  const bits = useMemo(() => (shot > 0 && origin && !reduced ? makeBits(origin.x, origin.y, origin.width) : []), [shot, origin, reduced]);
  useEffect(() => {
    if (bits.length === 0) return;
    clock.value = 0;
    clock.value = withTiming(LIFE_MS + 200, { duration: LIFE_MS + 200, easing: Easing.linear });
  }, [bits, clock]);
  if (bits.length === 0) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {bits.map((b, i) => <Piece key={`${shot}-${i}`} bit={b} clock={clock} />)}
    </View>
  );
}
