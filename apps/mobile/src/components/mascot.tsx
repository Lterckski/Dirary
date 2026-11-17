import { createElement, useEffect, useRef, type ComponentType, type ReactElement } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop, Svg } from 'react-native-svg';
import { createMascot, createMascotPaws, type MascotProps } from '@dirary/ui';

type Primitive = ComponentType<any>;

/** Ink, drawn with react-native-svg from the shared drawing in @dirary/ui. */
export const StaticMascot = createMascot<Primitive, ReactElement>(createElement, {
  Svg, Path, Circle, Ellipse, Defs, RadialGradient, LinearGradient, Stop,
});

/** Ink's front paws, drawn in front of a card when he stands up to look over it. */
export const MascotPaws = createMascotPaws<Primitive, ReactElement>(createElement, {
  Svg, Path, Circle, Ellipse, Defs, RadialGradient, LinearGradient, Stop,
});

/** Ink with small reactions: a hop when he cheers, slow breathing while he sleeps. */
export function Mascot(props: MascotProps) {
  const { mood = 'happy' } = props;
  const hop = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    let running: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      if (mood === 'cheer') {
        running = Animated.sequence([
          Animated.timing(hop, { toValue: -10, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.spring(hop, { toValue: 0, damping: 9, stiffness: 220, mass: 0.6, useNativeDriver: true }),
        ]);
      } else if (mood === 'sleepy') {
        running = Animated.loop(
          Animated.sequence([
            Animated.timing(breathe, { toValue: 1.03, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(breathe, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ]),
        );
      }
      running?.start();
    });
    return () => {
      cancelled = true;
      running?.stop();
      hop.setValue(0);
      breathe.setValue(1);
    };
  }, [mood, hop, breathe]);

  return (
    <Animated.View style={{ transform: [{ translateY: hop }, { scale: breathe }] }}>
      <StaticMascot {...props} />
    </Animated.View>
  );
}
