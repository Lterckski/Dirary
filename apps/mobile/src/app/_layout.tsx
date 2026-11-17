import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Tabs } from 'expo-router/js-tabs';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Alert, Pressable } from 'react-native';
import { colors, fonts } from '@dirary/ui';

import { HealthIcon, MoneyIcon, TasksIcon, TodayIcon } from '@/components/icons';
import { StaticMascot } from '@/components/mascot';
import { SetupNeeded, SignIn } from '@/components/sign-in';
import { FloatingTabBar } from '@/components/tab-bar';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

export function CoachButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Chat with Ink"
      onPress={() => Alert.alert('Ink', 'Coach chat is on the later list. For now, my tips are on each screen.')}
      style={{ width: 48, height: 48, borderRadius: 24, marginRight: 16, backgroundColor: colors.inkBlue, alignItems: 'center', justifyContent: 'center' }}>
      <StaticMascot mood="coach" size={44} />
    </Pressable>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_800ExtraBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });
  const session = useSession();
  const ready = (fontsLoaded || fontError != null) && session !== undefined;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  if (!supabase) return <><StatusBar style="light" /><SetupNeeded /></>;
  if (!session) return <><StatusBar style="light" /><SignIn /></>;

  return (
    <>
      <StatusBar style="light" />
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
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
