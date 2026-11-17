import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { Keyboard, Modal, Pressable, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { Path, Svg } from 'react-native-svg';
import { colors, radius, space } from '@dirary/ui';

import { Text } from '@/components/ui';
import { requestAdd } from '@/lib/add-bus';
import { ADD_KINDS, addTo } from '@/lib/add-to';
import { EASE_OUT } from '@/lib/motion';

const BAR_HEIGHT = 72;
const FAB_SIZE = 68;

/** A floating pill with the four tabs and a centre + button that adds to the screen you're on. */
export function FloatingTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const [typing, setTyping] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setTyping(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setTyping(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (typing) return null;

  const current = state.routes[state.index]?.name;
  const onMoney = current === 'money';

  function add() {
    Haptics.selectionAsync().catch(() => {});
    if (onMoney) return requestAdd('money');
    if (current === 'health') return requestAdd('health'); // + starts a food search
    if (current === 'tasks') return requestAdd('tasks');
    // On Today, + asks what to add.
    setMenu(true);
  }

  const tab = (index: number) => {
    const route = state.routes[index];
    if (!route) return null;
    const options = descriptors[route.key]?.options;
    const focused = state.index === index;
    const color = focused ? colors.inkBlue : colors.muted;
    const label = typeof options?.title === 'string' ? options.title : route.name;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        onPress={() => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        }}
        style={{ flex: 1, height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        {options?.tabBarIcon?.({ focused, color, size: 24 })}
        <Text variant="small" weight={focused ? 'bold' : 'semi'} style={{ color }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: space[4], right: space[4], bottom: insets.bottom + space[3] }}>
      <View style={{ height: BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[2], borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.raised }}>
        {tab(0)}
        {tab(1)}
        <View style={{ width: FAB_SIZE + space[2] }} />
        {tab(2)}
        {tab(3)}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={onMoney ? 'Add a transaction' : current === 'health' ? 'Log food' : current === 'tasks' ? 'Add a task' : 'Add something'}
        onPress={add}
        style={({ pressed }) => ({
          position: 'absolute', alignSelf: 'center', top: -22, width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2,
          borderWidth: 4, borderColor: colors.night, backgroundColor: colors.inkBlue, alignItems: 'center', justifyContent: 'center',
          transform: [{ scale: pressed ? 0.95 : 1 }],
        })}>
        <Svg width={28} height={28} viewBox="0 0 28 28">
          <Path d="M14 5v18M5 14h18" fill="none" stroke={colors.onInkBlue} strokeWidth={3.2} strokeLinecap="round" />
        </Svg>
      </Pressable>
      <Modal visible={menu} transparent animationType="none" onRequestClose={() => setMenu(false)} statusBarTranslucent>
        <Pressable accessibilityLabel="Close" onPress={() => setMenu(false)} style={{ flex: 1 }}>
          <Animated.View entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
        </Pressable>
        <Animated.View
          entering={ZoomIn.duration(200).easing(EASE_OUT).withInitialValues({ transform: [{ scale: 0.94 }] }).reduceMotion(ReduceMotion.System)}
          accessibilityViewIsModal
          style={{ position: 'absolute', alignSelf: 'center', bottom: insets.bottom + space[3] + BAR_HEIGHT + space[4], width: 240, padding: space[2], gap: 2,
            borderRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.raised, transformOrigin: 'bottom' }}>
          {ADD_KINDS.map(({ kind, label, hint }) => (
            <Pressable key={kind} accessibilityRole="button" accessibilityHint={hint}
              onPress={() => { setMenu(false); Haptics.selectionAsync().catch(() => {}); addTo(kind); }}
              style={({ pressed }) => ({ minHeight: 52, paddingHorizontal: space[4], borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: pressed ? colors.surface : 'transparent' })}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.inkBlue, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={14} height={14} viewBox="0 0 16 16"><Path d="M8 3v10M3 8h10" fill="none" stroke={colors.onInkBlue} strokeWidth={2.4} strokeLinecap="round" /></Svg>
              </View>
              <Text weight="semi">{label}</Text>
            </Pressable>
          ))}
        </Animated.View>
      </Modal>
    </View>
  );
}
