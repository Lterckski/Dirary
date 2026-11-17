import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text as RNText, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import { colors, fonts, radius, space, type } from '@dirary/ui';

type Variant = 'hero' | 'title' | 'heading' | 'body' | 'label' | 'small';
const DISPLAY: readonly Variant[] = ['hero', 'title', 'heading'];

export function Text({ variant = 'body', muted, weight, style, ...rest }: TextProps & { variant?: Variant; muted?: boolean; weight?: 'medium' | 'semi' | 'bold' }) {
  const t = type[variant];
  const family = DISPLAY.includes(variant) ? fonts.display
    : weight === 'bold' ? fonts.bodyBold : weight === 'semi' ? fonts.bodySemi : weight === 'medium' ? fonts.bodyMedium : fonts.body;
  const base: TextStyle = { fontFamily: family, fontSize: t.size, lineHeight: t.line, color: muted ? colors.muted : colors.text };
  return <RNText style={[base, style]} {...rest} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({ label, onPress, primary, disabled }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, primary && styles.primary, (pressed || disabled) && { opacity: 0.6 }]}>
      <Text weight={primary ? 'bold' : 'semi'} style={{ color: primary ? colors.onInkBlue : colors.text }}>{label}</Text>
    </Pressable>
  );
}

/** Room a scrolling screen leaves at the bottom for the floating tab bar and its + button. */
export const TAB_BAR_CLEARANCE = 140;

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  // The bottom padding keeps the last row clear of the floating tab bar.
  content: { padding: space[5], gap: space[5], paddingBottom: TAB_BAR_CLEARANCE },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.xl, padding: space[5], gap: space[3] },
  button: { minHeight: 48, paddingHorizontal: space[6], borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: colors.inkBlue, borderColor: colors.inkBlue },
  input: { minHeight: 48, paddingHorizontal: space[4], borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.raised, color: colors.text, fontFamily: fonts.body, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
});
