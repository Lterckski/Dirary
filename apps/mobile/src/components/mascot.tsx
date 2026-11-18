import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Image, View } from 'react-native';
import type { MascotProps } from '@dirary/ui';

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

/** Ink with small reactions: a hop when she cheers, slow breathing while she sleeps. */
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
          Animated.timing(hop, { toValue: -10, duration: 140, useNativeDriver: true }),
          Animated.spring(hop, { toValue: 0, damping: 9, stiffness: 220, mass: 0.6, useNativeDriver: true }),
        ]);
      } else if (mood === 'sleepy') {
        running = Animated.loop(
          Animated.sequence([
            Animated.timing(breathe, { toValue: 1.03, duration: 1800, useNativeDriver: true }),
            Animated.timing(breathe, { toValue: 1, duration: 1800, useNativeDriver: true }),
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
    <Animated.View style={{ transform: [{ translateY: hop }, { scale: breathe }], transformOrigin: 'bottom' }}>
      <StaticMascot {...props} />
    </Animated.View>
  );
}
