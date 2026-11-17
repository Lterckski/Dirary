/** Small animated pieces for numbers and bars: a progress bar that slides, and a floating "−₱130" after a change. */
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { ReduceMotion, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, radius } from '@dirary/ui';
import { formatPeso } from '@dirary/shared';

import { Text } from '@/components/ui';
import { EASE_OUT } from '@/lib/motion';

/** A progress bar whose fill slides to its new width instead of jumping. Starts at its value, so nothing grows on open. */
export function Bar({ pct, color, height = 8, label }: { pct: number; color: string; height?: number; label: string }) {
  const width = useSharedValue(pct);
  useEffect(() => {
    width.value = withTiming(pct, { duration: 240, easing: EASE_OUT, reduceMotion: ReduceMotion.System });
  }, [pct, width]);
  const fill = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: pct }} style={{ height, borderRadius: radius.pill, backgroundColor: colors.line, overflow: 'hidden' }}>
      <Animated.View style={[{ height, borderRadius: radius.pill, backgroundColor: color }, fill]} />
    </View>
  );
}

/** The last change to a number, kept for about a second. Null on first load and while `value` is null. */
export function useChange(value: number | null): { key: number; delta: number } | null {
  const prev = useRef<number | null>(null);
  const [change, setChange] = useState<{ key: number; delta: number } | null>(null);
  useEffect(() => {
    if (value === null) return;
    const was = prev.current;
    prev.current = value;
    if (was === null || was === value) return;
    const key = Date.now();
    setChange({ key, delta: value - was });
    setTimeout(() => setChange((c) => (c?.key === key ? null : c)), 1000);
  }, [value]);
  return change;
}

/** "−₱130" or "+₱5,000" rising and fading beside a big number. Place it absolutely; hidden with Reduce motion. */
export function ChangeTag({ change }: { change: { key: number; delta: number } | null }) {
  const reduced = useReducedMotion();
  if (!change || reduced) return null;
  return <Floating key={change.key} delta={change.delta} />;
}

function Floating({ delta }: { delta: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withTiming(1, { duration: 1000 }); }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.15, 0.7, 1], [0, 1, 1, 0]),
    transform: [{ translateY: interpolate(t.value, [0, 0.15, 0.7, 1], [6, 0, -8, -16]) }],
  }));
  return (
    <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ paddingHorizontal: 10, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.raised }, style]}>
      <Text weight="bold" style={{ color: delta < 0 ? colors.text : colors.inkBlue, fontVariant: ['tabular-nums'] }}>{formatPeso(delta, { sign: true })}</Text>
    </Animated.View>
  );
}
