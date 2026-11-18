/**
 * How every pop-up opens on the phone: the screen behind dims, and the panel rises from the bottom
 * on the drawer curve (fast start, long soft landing). Closing is instant, so nothing waits on motion.
 * With Reduce motion on, the pop-up fades in instead.
 */
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import Animated, { Easing, FadeIn, ReduceMotion, SlideInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@dirary/ui';

export const EASE_DRAWER = Easing.bezier(0.32, 0.72, 0, 1);
const RISE = SlideInDown.duration(380).easing(EASE_DRAWER).reduceMotion(ReduceMotion.System);
const DIM = FadeIn.duration(220).reduceMotion(ReduceMotion.System);

export function PopUp({ onClose, card = false, navigationBarTranslucent = false, children }: {
  onClose: () => void;
  /** A card stops short of the top, so the dimmed screen shows above it; tapping there closes it. Otherwise it fills the screen. */
  card?: boolean;
  navigationBarTranslucent?: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  return (
    <Modal visible transparent animationType={reduce ? 'fade' : 'none'} onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent={navigationBarTranslucent}>
      <Animated.View entering={DIM} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
        {card && <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />}
      </Animated.View>
      <Animated.View entering={RISE} accessibilityViewIsModal
        style={card
          ? { flex: 1, marginTop: insets.top + 12, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.line, backgroundColor: colors.night, overflow: 'hidden' }
          : { flex: 1, backgroundColor: colors.night }}>
        {children}
      </Animated.View>
    </Modal>
  );
}
