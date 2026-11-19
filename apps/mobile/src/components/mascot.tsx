import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, View } from 'react-native';
import type { MascotMood, MascotProps } from '@dirary/ui';

/**
 * Ink, from the cut-out pictures in assets/mascot (made by tools/mascot/build.py from the Gemini art).
 * Each picture is square with Ink bottom-aligned, her head and collar about 80% of the width.
 */
const INK = {
  happy: require('../../assets/mascot/ink-happy.png'),
  coach: require('../../assets/mascot/ink-coach.png'),
  cheer: require('../../assets/mascot/ink-cheer.png'),
  sleepy: require('../../assets/mascot/ink-sleepy.png'),
  worried: require('../../assets/mascot/ink-worried.png'),
} as const;
const PAWS = require('../../assets/mascot/ink-paws.png');
/** The paws picture is 410 × 108; the card's edge (the ledge she leans on) is two thirds of the way down. */
const PAWS_RATIO = 108 / 410;
const LEDGE = 2 / 3;

export function StaticMascot({ mood = 'happy', size = 240 }: MascotProps) {
  return <Image source={INK[mood]} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />;
}

/**
 * Ink's front paws, drawn in front of a card so she seems to lean on it. Takes the same size as the
 * Ink above it and fills a box size wide and size/4 tall, with the card's edge 58% of the way down,
 * so screens can place it exactly where the old drawing went.
 */
export function MascotPaws({ size = 240 }: { size?: number }) {
  const width = size * 0.8;
  const height = width * PAWS_RATIO;
  const edge = (size / 4) * 0.58;
  return (
    <View style={{ width: size, height: size / 4 }}>
      <Image source={PAWS} style={{ position: 'absolute', left: (size - width) / 2, top: edge - height * LEDGE, width, height }} resizeMode="contain" />
    </View>
  );
}

/** True while the phone's "reduce motion" setting is on, kept up to date if it changes. */
function useReduceMotion() {
  const [reduce, setReduce] = useState(true);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => alive && setReduce(on));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

const ease = Easing.inOut(Easing.sin);

/**
 * Ink's idle loop for each mood. Moves are in pixels for a 96 px Ink (k scales them) and degrees,
 * pivoting at her feet so a tilt reads as her head going side to side.
 */
function idleLoop(mood: MascotMood, k: number, v: { rot: Animated.Value; ty: Animated.Value; tx: Animated.Value; scale: Animated.Value }) {
  const to = (value: Animated.Value, toValue: number, duration: number, easing = ease) =>
    Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });
  const { sequence, parallel, delay } = Animated;
  switch (mood) {
    case 'happy':
      // A curious head tilt one way, then the other, with a little lift each time.
      return sequence([
        parallel([to(v.rot, -4, 700), to(v.ty, -1.5 * k, 700)]),
        delay(500),
        parallel([to(v.rot, 3.5, 900), to(v.ty, 0, 900)]),
        delay(400),
        to(v.rot, 0, 600),
        delay(1600),
      ]);
    case 'coach':
      // Two quick encouraging nods, then she waits for you.
      return sequence([
        to(v.ty, 2 * k, 140), to(v.ty, 0, 160),
        to(v.ty, 2 * k, 140), to(v.ty, 0, 200),
        delay(900),
        to(v.rot, -2.5, 500), delay(700), to(v.rot, 0, 500),
        delay(2200),
      ]);
    case 'cheer':
      // Happy little bounces with a wiggle, like a wagging tail.
      return sequence([
        to(v.ty, -6 * k, 180, Easing.out(Easing.quad)), to(v.ty, 0, 200, Easing.in(Easing.quad)),
        to(v.ty, -4 * k, 150, Easing.out(Easing.quad)), to(v.ty, 0, 170, Easing.in(Easing.quad)),
        to(v.rot, 4, 110), to(v.rot, -4, 160), to(v.rot, 3, 140), to(v.rot, 0, 120),
        delay(1300),
      ]);
    case 'sleepy':
      // Slow, deep breaths with a drowsy lean.
      return sequence([
        parallel([to(v.scale, 1.035, 2000), to(v.rot, -1.5, 2000)]),
        parallel([to(v.scale, 1, 2400), to(v.rot, 0, 2400)]),
        delay(400),
      ]);
    case 'worried':
      // A nervous fidget, then a hopeful tilt.
      return sequence([
        to(v.tx, -1.5 * k, 80), to(v.tx, 1.5 * k, 90), to(v.tx, -1 * k, 90), to(v.tx, 0, 80),
        delay(1400),
        to(v.rot, 3, 600), delay(900), to(v.rot, 0, 600),
        delay(1600),
      ]);
  }
}

/** Ink, gently alive: a head tilt, nods, bounces, breaths or a fidget depending on her mood. Still when reduce motion is on. */
export function Mascot(props: MascotProps) {
  const { mood = 'happy', size = 240 } = props;
  const reduce = useReduceMotion();
  const [v] = useState(() => ({ rot: new Animated.Value(0), ty: new Animated.Value(0), tx: new Animated.Value(0), scale: new Animated.Value(1) }));

  useEffect(() => {
    if (reduce) return;
    const k = size / 96;
    // A bigger hop when she starts cheering, then the idle loop, offset a little so Inks on one screen don't move in sync.
    const intro = mood === 'cheer'
      ? Animated.sequence([
          Animated.timing(v.ty, { toValue: -10 * k, duration: 140, useNativeDriver: true }),
          Animated.spring(v.ty, { toValue: 0, damping: 9, stiffness: 220, mass: 0.6, useNativeDriver: true }),
        ])
      : Animated.delay(300 + Math.random() * 1500);
    const running = Animated.sequence([intro, Animated.loop(idleLoop(mood, k, v))]);
    running.start();
    return () => {
      running.stop();
      v.rot.setValue(0);
      v.ty.setValue(0);
      v.tx.setValue(0);
      v.scale.setValue(1);
    };
  }, [mood, size, reduce, v]);

  const rotate = v.rot.interpolate({ inputRange: [-10, 10], outputRange: ['-10deg', '10deg'] });
  return (
    <Animated.View style={{ transform: [{ translateX: v.tx }, { translateY: v.ty }, { rotate }, { scale: v.scale }], transformOrigin: 'bottom' }}>
      <StaticMascot {...props} />
    </Animated.View>
  );
}
