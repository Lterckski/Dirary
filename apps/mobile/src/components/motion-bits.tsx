/** Small animated pieces for numbers and bars: a progress bar that slides, and a floating "−₱130" after a change. */
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
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

/** A row of equal-width options with one selected, like Spent / Received. */
export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T | null; onChange: (value: T) => void }) {
  // One highlight that slides to the chosen option instead of jumping.
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const step = (width - 8) / options.length; // inside the 1px border and 3px padding
  const x = useSharedValue(index * step);
  useEffect(() => {
    x.value = withTiming(index * step, { duration: 150, easing: EASE_OUT, reduceMotion: ReduceMotion.System });
  }, [index, step, x]);
  const highlight = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', padding: 3, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
      {width > 0 && value !== null && options.some((o) => o.value === value) && (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 3, bottom: 3, left: 3, width: step, borderRadius: 999, backgroundColor: colors.inkBlue }, highlight]} />
      )}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}>
            <Text weight={on ? 'bold' : 'semi'} style={{ color: on ? colors.onInkBlue : colors.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
