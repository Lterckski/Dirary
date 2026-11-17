/** The motion vocabulary shared by every screen: one easing curve, and the list enter / leave / move transitions. */
import { Easing, FadeInDown, FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';

export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** How long a ticked item stays visible, checked, before it moves away. */
export const CHECKED_MS = 340;
export const ENTER = FadeInDown.duration(200).easing(EASE_OUT).withInitialValues({ transform: [{ translateY: -6 }] }).reduceMotion(ReduceMotion.System);
export const LEAVE = FadeOut.duration(160).reduceMotion(ReduceMotion.System);
export const MOVE = LinearTransition.duration(220).easing(EASE_OUT).reduceMotion(ReduceMotion.System);
