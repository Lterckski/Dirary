import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';
import { colors, radius, space } from '@dirary/ui';

import { Text } from '@/components/ui';
import { requestAdd } from '@/lib/add-bus';

const BAR_HEIGHT = 72;
const FAB_SIZE = 68;

/** A floating pill with the four tabs and a centre + button that adds to the screen you're on. */
export function FloatingTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const [typing, setTyping] = useState(false);
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
    // From Today, + starts a task.
    const tasks = state.routes.find((r) => r.name === 'tasks');
    if (current !== 'tasks' && tasks) navigateToTab(tasks.key);
    requestAdd('tasks');
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
        accessibilityLabel={onMoney ? 'Add a transaction' : current === 'health' ? 'Log food' : 'Add a task'}
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
    </View>
  );
}
