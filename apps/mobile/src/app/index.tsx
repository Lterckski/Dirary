import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { MASCOT_MOODS, colors, radius, space, type MascotMood } from '@dirary/ui';
import type { SyncProbe } from '@dirary/shared';

import { Mascot, StaticMascot } from '@/components/mascot';
import { Button, Card, Text, styles } from '@/components/ui';
import { addNote, listNotes, pendingCount, syncNow } from '@/lib/sync';
import { supabase } from '@/lib/supabase';

const MOOD_LINES: Record<MascotMood, string> = {
  happy: 'Default on home, widgets and the app icon.',
  coach: 'Tips, nudges and the chat button.',
  cheer: 'Task done, budget kept, workout logged.',
  sleepy: 'Empty states and nothing due.',
  worried: 'Overdue task, over budget, missed log.',
};

export default function TodayScreen() {
  const [mood, setMood] = useState<MascotMood>('happy');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <View style={{ flex: 1, gap: space[1] }}>
          <Text variant="label" weight="semi" style={{ color: colors.inkBlue, letterSpacing: 1.2 }}>PHASE 0 · FOUNDATION</Text>
          <Text variant="title">The shell is up</Text>
        </View>
        <Mascot mood={mood} size={96} />
      </View>

      <Card>
        <Text variant="heading">Ink's five moods</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {MASCOT_MOODS.map((m) => (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityLabel={`Show ${m} mood`}
              accessibilityState={{ selected: m === mood }}
              onPress={() => {
                setMood(m);
                if (m === 'cheer') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={{ width: '31%', alignItems: 'center', gap: 4, padding: space[2], borderRadius: radius.lg, backgroundColor: colors.raised, borderWidth: 1, borderColor: m === mood ? colors.inkBlue : 'transparent' }}>
              <StaticMascot mood={m} size={72} />
              <Text variant="label" weight="semi" style={{ textTransform: 'capitalize' }}>{m}</Text>
            </Pressable>
          ))}
        </View>
        <Text muted>{MOOD_LINES[mood]}</Text>
      </Card>

      <SyncTest />
      <Button label="Sign out" onPress={() => supabase?.auth.signOut()} />
    </ScrollView>
  );
}

/** Notes are saved on the phone first, then synced. Works offline; the pending count shows what is waiting. */
function SyncTest() {
  const [rows, setRows] = useState<SyncProbe[]>([]);
  const [pending, setPending] = useState(0);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');

  const refresh = useCallback(async () => {
    setRows(await listNotes());
    setPending(await pendingCount());
  }, []);

  const sync = useCallback(async () => {
    if (!supabase) return;
    try {
      const { pushed, pulled } = await syncNow(supabase);
      setStatus(`Synced. Sent ${pushed}, received ${pulled}.`);
    } catch (e) {
      setStatus(`Saved on this phone. Sync will retry: ${e instanceof Error ? e.message : 'offline'}`);
    }
    await refresh();
  }, [refresh]);

  useEffect(() => {
    refresh().then(sync);
  }, [refresh, sync]);

  async function add() {
    const text = note.trim();
    if (!text) return;
    setNote('');
    await addNote(text);
    await refresh();
    await sync();
  }

  return (
    <Card>
      <Text variant="heading">Sync test</Text>
      <Text muted>Add a note here and it should show up on the web, and the other way round. Try it in airplane mode too.</Text>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel="Note" placeholder="Hello from the phone" placeholderTextColor={colors.faint}
          style={[styles.input, { flex: 1 }]} maxLength={200} value={note} onChangeText={setNote} onSubmitEditing={add} />
        <Button primary label="Add" onPress={add} />
      </View>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text variant="label" muted style={{ flex: 1 }}>{pending > 0 ? `${pending} waiting to sync. ` : ''}{status}</Text>
        <Button label="Sync" onPress={sync} />
      </View>
      {rows.length === 0 ? (
        <Text variant="label" muted>No notes yet.</Text>
      ) : (
        rows.map((row) => (
          <View key={row.id} style={{ padding: space[3], borderRadius: radius.md, backgroundColor: colors.raised, gap: 2 }}>
            <Text>{row.note}</Text>
            <Text variant="small" muted>{new Date(row.updated_at).toLocaleString()}</Text>
          </View>
        ))
      )}
    </Card>
  );
}
