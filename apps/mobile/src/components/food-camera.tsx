/**
 * Snap your plate and Ink guesses the dish, on the phone (no upload, no API). Picking a guess searches for it,
 * so the calories come from the same food search as typing: PhilFCT, your foods, USDA and Open Food Facts.
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space } from '@dirary/ui';

import { Press } from '@/components/press';
import { Button, Text } from '@/components/ui';
import { PopUp } from '@/components/pop-up';
import { guessFood, type FoodGuess } from '../../modules/dirary-food-lens';

export function FoodCamera({ onPick, onClose }: { onPick: (search: string) => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [state, setState] = useState<{ kind: 'aim' } | { kind: 'looking' } | { kind: 'guesses'; guesses: FoodGuess[] } | { kind: 'problem'; text: string }>({ kind: 'aim' });
  const insets = useSafeAreaInsets();

  async function snap() {
    if (!camera.current || state.kind === 'looking') return;
    setState({ kind: 'looking' });
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.6 });
      if (!photo) throw new Error('No photo');
      const guesses = (await guessFood(photo.uri)).slice(0, 4);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setState({ kind: 'guesses', guesses });
    } catch {
      setState({ kind: 'problem', text: 'Couldn’t read that photo. Try again, or type the food instead.' });
    }
  }

  // "Philippine adobo" → "adobo", so it also finds PhilFCT's "Pork adobo" and "Chicken adobo".
  const pick = (name: string) => onPick(name.replace(/^(philippine|filipino)\s+/i, ''));

  return (
    <PopUp onClose={onClose} navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.night }}>
        {permission?.granted ? (
          <CameraView ref={camera} style={{ flex: 1 }} facing="back" animateShutter />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[6], gap: space[4] }}>
            <Text variant="heading" style={{ textAlign: 'center' }}>Snap your food</Text>
            <Text muted style={{ textAlign: 'center' }}>
              {permission && !permission.canAskAgain ? 'Camera access is off for Dirary. Turn it on in Settings › Apps › Dirary › Permissions.' : 'Dirary needs the camera to see your plate. The photo stays on your phone.'}
            </Text>
            {(!permission || permission.canAskAgain) && <Button primary label="Allow camera" onPress={requestPermission} />}
          </View>
        )}

        <Press accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8}
          style={{ position: 'absolute', top: insets.top + space[3], right: space[4], width: 48, height: 48, borderRadius: 24, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="heading">✕</Text>
        </Press>

        {permission?.granted && (
          <View accessibilityLiveRegion="polite" style={{ position: 'absolute', left: space[4], right: space[4], bottom: insets.bottom + space[4], gap: space[3], padding: space[3], borderRadius: radius.widget, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
            {state.kind === 'aim' && <Text weight="semi" style={{ textAlign: 'center' }}>Fill the frame with one dish</Text>}
            {state.kind === 'looking' && (
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space[3] }}>
                <ActivityIndicator color={colors.inkBlue} />
                <Text weight="semi">Ink is sniffing it out…</Text>
              </View>
            )}
            {state.kind === 'problem' && <Text style={{ color: colors.amber }}>{state.text}</Text>}
            {state.kind === 'guesses' && (state.guesses.length === 0
              ? <Text style={{ color: colors.amber }}>Ink couldn’t tell what that is. Try closer, or type it in search.</Text>
              : <>
                  <Text variant="label" muted>Which is it? The calories come from food search.</Text>
                  {state.guesses.map((g) => (
                    <Press key={g.name} accessibilityRole="button" accessibilityLabel={`${g.name}, ${Math.round(g.confidence * 100)} percent sure`} onPress={() => pick(g.name)}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, paddingHorizontal: space[3], borderRadius: 14, backgroundColor: pressed ? colors.raised : 'transparent' })}>
                      <Text weight="semi" style={{ flex: 1 }} numberOfLines={1}>{g.name}</Text>
                      <Text variant="small" weight="bold" muted>{Math.round(g.confidence * 100)}%</Text>
                    </Press>
                  ))}
                </>)}
            <Button primary label={state.kind === 'aim' || state.kind === 'looking' ? 'Snap' : 'Snap again'} disabled={state.kind === 'looking'} onPress={snap} />
          </View>
        )}
      </View>
    </PopUp>
  );
}
