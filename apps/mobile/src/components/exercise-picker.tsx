/** Find one of your exercises or a starter one, or make a new one. */
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { colors, space } from '@dirary/ui';
import { STARTER_EXERCISES, type Exercise, type StarterExercise } from '@dirary/shared';

import { Text, styles } from '@/components/ui';
import { addExercise } from '@/lib/workouts-store';

export function ExercisePicker({ exercises, onPick, onCancel }: { exercises: readonly Exercise[]; onPick: (exercise: Exercise) => void; onCancel?: () => void }) {
  const [q, setQ] = useState('');
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (name: string) => words.every((w) => name.toLowerCase().split(/[\s-]+/).some((p) => p.startsWith(w)));
  const mine = exercises.filter((e) => match(e.name)).slice(0, 6);
  const starters = STARTER_EXERCISES.filter((s) => !exercises.some((e) => e.starter_key === s.key || e.name.toLowerCase() === s.name.toLowerCase()) && match(s.name)).slice(0, 10);
  const row = (key: string, title: string, tag: string, onPress: () => void, mineTag = false) => (
    <Pressable key={key} accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, paddingHorizontal: space[3], borderRadius: 14, backgroundColor: pressed ? colors.raised : 'transparent' })}>
      <Text weight="semi" style={{ flex: 1 }}>{title}</Text>
      <Text variant="small" weight="bold" style={{ color: mineTag ? colors.inkBlue : colors.muted, letterSpacing: 0.8 }}>{tag.toUpperCase()}</Text>
    </Pressable>
  );
  return (
    <View style={{ gap: space[2], borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, padding: space[2] }}>
      <TextInput accessibilityLabel="Find an exercise" style={styles.input} value={q} onChangeText={setQ} placeholder="Find an exercise" placeholderTextColor={colors.faint} autoFocus />
      {mine.map((e) => row(e.id, e.name, 'Mine', () => onPick(e), true))}
      {starters.map((s: StarterExercise) => row(s.key, s.name, s.muscle_group, async () => onPick(await addExercise(s.name, s.muscle_group, s))))}
      {q.trim() !== '' && row('new', `+ New exercise “${q.trim()}”`, '', async () => onPick(await addExercise(q, null)))}
      {onCancel && <Pressable accessibilityRole="button" onPress={onCancel} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text weight="semi" muted>Cancel</Text></Pressable>}
    </View>
  );
}

