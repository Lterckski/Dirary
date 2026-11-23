/**
 * Snap your plate: the food-photo function (Gemini, free tier) lists each food with its portion and calories.
 * Untick what you didn't eat, fix the grams, and log them all at once.
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MEALS, MEAL_LABEL, formatKcal, parseGrams, type Food, type Meal, type PhotoFood } from '@dirary/shared';
import { colors, radius, space } from '@dirary/ui';

import { Press } from '@/components/press';
import { Chip } from '@/components/task-bits';
import { Button, Text, styles } from '@/components/ui';
import { PopUp } from '@/components/pop-up';
import { logPhotoFoods, lookAtPhoto } from '@/lib/health-store';

type Row = PhotoFood & { on: boolean; gramsText: string };
type State = { kind: 'aim' } | { kind: 'looking' } | { kind: 'found'; rows: Row[] } | { kind: 'problem'; text: string };

/** A row's figures at the grams typed (the estimate scaled), or null while the grams don't parse. */
function scaled(r: Row): PhotoFood | null {
  const grams = parseGrams(r.gramsText);
  if (!grams) return null;
  const k = grams / r.grams;
  return { name: r.name, grams, kcal: Math.round(r.kcal * k), protein_g: Math.round(r.protein_g * k * 10) / 10 };
}

export function FoodCamera({ meal: startMeal, foods, onLogged, onClose }: { meal: Meal; foods: readonly Food[]; onLogged: (kcal: number) => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [state, setState] = useState<State>({ kind: 'aim' });
  const [meal, setMeal] = useState(startMeal);
  const [saving, setSaving] = useState(false);
  const insets = useSafeAreaInsets();

  async function snap() {
    if (!camera.current || state.kind === 'looking') return;
    setState({ kind: 'looking' });
    try {
      // Low quality keeps the upload small; it's plenty to tell rice from adobo.
      const photo = await camera.current.takePictureAsync({ quality: 0.3, base64: true });
      if (!photo?.base64) throw new Error('Couldn’t take the photo. Try again.');
      const items = await lookAtPhoto(photo.base64);
      Haptics.notificationAsync(items.length ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setState(items.length ? { kind: 'found', rows: items.map((i) => ({ ...i, on: true, gramsText: String(i.grams) })) } : { kind: 'problem', text: 'Ink doesn’t see any food in that. Try again with your plate in the frame.' });
    } catch (e) {
      setState({ kind: 'problem', text: e instanceof Error ? e.message : 'Couldn’t read that photo. Try again.' });
    }
  }

  const rows = state.kind === 'found' ? state.rows : [];
  const chosen = rows.filter((r) => r.on).map(scaled);
  const ready = chosen.length > 0 && chosen.every(Boolean);
  const total = chosen.reduce((sum, f) => sum + (f?.kcal ?? 0), 0);
  const edit = (i: number, patch: Partial<Row>) => setState({ kind: 'found', rows: rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  async function log() {
    if (!ready || saving) return;
    setSaving(true);
    try {
      await logPhotoFoods(chosen as PhotoFood[], meal, foods);
      onLogged(total);
    } catch {
      setSaving(false);
      setState({ kind: 'problem', text: 'Couldn’t save that. Try again.' });
    }
  }

  return (
    <PopUp onClose={onClose} navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.night }}>
        {permission?.granted ? (
          <CameraView ref={camera} style={{ flex: 1 }} facing="back" animateShutter />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[6], gap: space[4] }}>
            <Text variant="heading" style={{ textAlign: 'center' }}>Snap your food</Text>
            <Text muted style={{ textAlign: 'center' }}>
              {permission && !permission.canAskAgain ? 'Camera access is off for Dirary. Turn it on in Settings › Apps › Dirary › Permissions.' : 'Dirary needs the camera to see your plate.'}
            </Text>
            {(!permission || permission.canAskAgain) && <Button primary label="Allow camera" onPress={requestPermission} />}
          </View>
        )}

        <Press accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8}
          style={{ position: 'absolute', top: insets.top + space[3], right: space[4], width: 48, height: 48, borderRadius: 24, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="heading">✕</Text>
        </Press>

        {permission?.granted && (
          <View accessibilityLiveRegion="polite" style={{ position: 'absolute', left: space[4], right: space[4], bottom: insets.bottom + space[4], maxHeight: '70%', gap: space[3], padding: space[3], borderRadius: radius.widget, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
            {state.kind === 'aim' && <Text weight="semi" style={{ textAlign: 'center' }}>Get your whole plate in the frame</Text>}
            {state.kind === 'looking' && (
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space[3] }}>
                <ActivityIndicator color={colors.inkBlue} />
                <Text weight="semi">Ink is sniffing it out…</Text>
              </View>
            )}
            {state.kind === 'problem' && <Text style={{ color: colors.amber }}>{state.text}</Text>}
            {state.kind === 'found' && (
              <>
                <Text variant="label" muted>Ink’s estimate. Untick what you didn’t eat and fix the grams.</Text>
                <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space[1] }}>
                  {rows.map((r, i) => {
                    const f = scaled(r);
                    return (
                      <View key={`${r.name}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 48 }}>
                        <Press accessibilityRole="checkbox" accessibilityState={{ checked: r.on }} accessibilityLabel={r.name} onPress={() => edit(i, { on: !r.on })} hitSlop={6}
                          style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: r.on ? colors.inkBlue : colors.line, backgroundColor: r.on ? colors.inkBlue : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                          {r.on && <Text weight="bold" style={{ color: colors.onInkBlue }}>✓</Text>}
                        </Press>
                        <View style={{ flex: 1 }}>
                          <Text weight="semi" numberOfLines={1} style={{ opacity: r.on ? 1 : 0.5 }}>{r.name}</Text>
                          <Text variant="small" muted>{f ? `${formatKcal(f.kcal)} kcal · ${f.protein_g} g protein` : 'Type the grams'}</Text>
                        </View>
                        <TextInput accessibilityLabel={`${r.name} grams`} value={r.gramsText} onChangeText={(t) => edit(i, { gramsText: t })} keyboardType="number-pad"
                          style={[styles.input, { width: 76, minHeight: 44, textAlign: 'right' }]} />
                        <Text muted>g</Text>
                      </View>
                    );
                  })}
                </ScrollView>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                  {MEALS.map((m) => <Chip key={m} label={MEAL_LABEL[m]} active={meal === m} onPress={() => setMeal(m)} />)}
                </View>
                <Button primary label={saving ? 'Saving…' : `Log ${formatKcal(total)} kcal`} disabled={!ready || saving} onPress={log} />
              </>
            )}
            {state.kind !== 'found' ? <Button primary label={state.kind === 'aim' || state.kind === 'looking' ? 'Snap' : 'Snap again'} disabled={state.kind === 'looking'} onPress={snap} />
              : <Button label="Snap again" onPress={() => setState({ kind: 'aim' })} />}
          </View>
        )}
      </View>
    </PopUp>
  );
}
