import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Tabs } from 'expo-router/js-tabs';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Alert, AppState, Easing } from 'react-native';
import { Press } from '@/components/press';
import { useReducedMotion } from 'react-native-reanimated';
import { colors, fonts } from '@dirary/ui';

import { HealthIcon, MoneyIcon, TasksIcon, TodayIcon } from '@/components/icons';
import { StaticMascot } from '@/components/mascot';
import { SetupNeeded, SignIn } from '@/components/sign-in';
import { FloatingTabBar } from '@/components/tab-bar';
import { markOpened, openNotificationTaps, requestReminderPermission } from '@/lib/reminders';
import { refreshWidgets } from '@/widgets/refresh';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

/**
 * Changing tabs: the new screen fades in while sliding a short way from the side its tab sits on,
 * and the old one leaves the other way. Short, because you switch tabs many times a day.
 * With Reduce motion on, it only crossfades.
 */
const TAB_SHIFT = {
  animation: 'shift',
  transitionSpec: { animation: 'timing', config: { duration: 220, easing: Easing.bezier(0.23, 1, 0.32, 1) } },
  sceneStyleInterpolator: ({ current }: { current: { progress: import('react-native').Animated.Value } }) => ({
    sceneStyle: {
      opacity: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
      transform: [{ translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-24, 0, 24] }) }],
    },
  }),
} as const;
const TAB_FADE = { animation: 'fade', transitionSpec: { animation: 'timing', config: { duration: 150, easing: Easing.out(Easing.quad) } } } as const;

export function CoachButton() {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel="Chat with Ink"
      onPress={() => Alert.alert('Ink', 'Coach chat is on the later list. For now, my tips are on each screen.')}
      style={{ width: 48, height: 48, borderRadius: 24, marginRight: 16, backgroundColor: colors.inkBlue, alignItems: 'center', justifyContent: 'center' }}>
      <StaticMascot mood="coach" size={44} />
    </Press>
  );
}

export default function RootLayout() {
  const reduceMotion = useReducedMotion();
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_800ExtraBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });
  const session = useSession();
  const ready = (fontsLoaded || fontError != null) && session !== undefined;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Once signed in: ask for notifications (Ink barks), count "days away" from now, and open what a tapped notification is about.
  const signedIn = ready && !!session;
  useEffect(() => {
    if (!signedIn) return;
    requestReminderPermission().then(() => markOpened()).catch(() => {});
    refreshWidgets().catch(() => {});
    const stopTaps = openNotificationTaps();
    const foreground = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      markOpened().catch(() => {});
      refreshWidgets().catch(() => {}); // home-screen widgets catch up whenever Dirary is opened
    });
    return () => { stopTaps(); foreground.remove(); };
  }, [signedIn]);

  if (!ready) return null;
  if (!supabase) return <><StatusBar style="light" /><SetupNeeded /></>;
  if (!session) return <><StatusBar style="light" /><SignIn /></>;

  return (
    <>
      <StatusBar style="light" />
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          ...(reduceMotion ? TAB_FADE : TAB_SHIFT),
          headerStyle: { backgroundColor: colors.night },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fonts.display, fontSize: 26 },
          headerTitleAlign: 'left',
          headerRight: () => <CoachButton />,
          sceneStyle: { backgroundColor: colors.night },
        }}>
        <Tabs.Screen name="index" options={{ title: 'Today', headerShown: false, tabBarIcon: ({ color }) => <TodayIcon color={color} /> }} />
        <Tabs.Screen name="tasks" options={{ title: 'Tasks', tabBarIcon: ({ color }) => <TasksIcon color={color} /> }} />
        <Tabs.Screen name="money" options={{ title: 'Money', headerShown: false, tabBarIcon: ({ color }) => <MoneyIcon color={color} /> }} />
        <Tabs.Screen name="health" options={{ title: 'Health', tabBarIcon: ({ color }) => <HealthIcon color={color} /> }} />
      </Tabs>
    </>
  );
}
