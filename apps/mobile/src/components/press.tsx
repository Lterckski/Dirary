/**
 * Press: a drop-in Pressable that squishes when you touch it and springs back when you let go, with a
 * light haptic tick. Big things (cards, rows) squish less than small things (chips, the + button), so
 * every press feels the same size. With Reduce motion on it only dims a little.
 */
import * as Haptics from 'expo-haptics';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, type GestureResponderEvent, type LayoutChangeEvent, type PressableProps, type PressableStateCallbackType, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Quick and a touch bouncy on the way back, like a soft rubber key. */
const DOWN = { damping: 30, stiffness: 900, mass: 0.6 } as const;
const UP = { damping: 12, stiffness: 420, mass: 0.6 } as const;

export type PressHaptic = 'light' | 'medium' | 'select' | false;

export interface PressProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  children?: ReactNode | ((state: PressableStateCallbackType) => ReactNode);
  /** Override how small it gets while held (1 = no squish). By default it depends on its width. */
  pressScale?: number;
  /** The tick you feel on touch. Default 'select', the lightest. */
  haptic?: PressHaptic;
  /** Pushes down a few points as well as squishing: for chunky primary buttons with a ledge. */
  sink?: number;
}

function tick(kind: PressHaptic) {
  if (!kind) return;
  const run = kind === 'select' ? Haptics.selectionAsync()
    : Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  run.catch(() => {});
}

/** About 6 points of squish whatever the size, kept between 0.94 and 0.985. */
function scaleFor(width: number) {
  if (width <= 0) return 0.96;
  return Math.min(0.985, Math.max(0.94, 1 - 12 / width));
}

export function Press({ style, children, pressScale, haptic = 'select', sink = 0, onPressIn, onPressOut, onLayout, disabled, ...rest }: PressProps) {
  const reduceMotion = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const [width, setWidth] = useState(0);
  const down = useSharedValue(0);
  const target = pressScale ?? scaleFor(width);

  const animated = useAnimatedStyle(() => (reduceMotion
    ? { opacity: 1 - down.value * 0.25 }
    : { transform: [{ translateY: down.value * sink }, { scale: 1 - down.value * (1 - target) }] }));

  const handleIn = useCallback((e: GestureResponderEvent) => {
    setPressed(true);
    down.value = reduceMotion ? withTiming(1, { duration: 80 }) : withSpring(1, DOWN);
    tick(haptic);
    onPressIn?.(e);
  }, [down, haptic, onPressIn, reduceMotion]);

  const handleOut = useCallback((e: GestureResponderEvent) => {
    setPressed(false);
    down.value = reduceMotion ? withTiming(0, { duration: 120 }) : withSpring(0, UP);
    onPressOut?.(e);
  }, [down, onPressOut, reduceMotion]);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
    onLayout?.(e);
  }, [onLayout]);

  const state: PressableStateCallbackType = { pressed, hovered: false } as PressableStateCallbackType;
  const resolved = typeof style === 'function' ? style(state) : style;
  const content = typeof children === 'function' ? children(state) : children;

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={handleIn}
      onPressOut={handleOut}
      onLayout={handleLayout}
      style={[resolved, animated]}
      {...rest}>
      {content}
    </AnimatedPressable>
  );
}
