/** Today's steps from Samsung Health (through Health Connect), with a daily goal of 8,000. */
import { useCallback, useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { colors } from '@dirary/ui';
import { formatKcal } from '@dirary/shared';

import { Bar } from '@/components/motion-bits';
import { Button, Card, Text, styles } from '@/components/ui';
import { askForSteps, todaysSteps, type StepsState } from '@/lib/steps';

const GOAL = 8000;
const LABEL = { letterSpacing: 1.4, color: colors.muted } as const;

export function StepsCard() {
  const [state, setState] = useState<StepsState | null>(null);
  const refresh = useCallback(() => { todaysSteps().then(setState).catch(() => setState({ kind: 'unavailable' })); }, []);
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => sub.remove();
  }, [refresh]);

  if (!state || state.kind === 'unavailable') return null;
  return (
    <Card style={{ borderRadius: 28 }}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text variant="small" weight="bold" style={LABEL}>STEPS</Text>
        <Text variant="label" muted>From Samsung Health</Text>
      </View>
      {state.kind === 'needs-permission' ? (
        <>
          <Text muted>Let Dirary read your steps from Health Connect. It only reads steps, and never writes anything.</Text>
          <View style={styles.row}><Button primary label="Show my steps" onPress={() => askForSteps().then(setState)} /></View>
        </>
      ) : (
        <>
          <View style={[styles.row, { alignItems: 'baseline', gap: 8 }]}>
            <Text variant="hero" style={{ fontVariant: ['tabular-nums'] }}>{formatKcal(state.steps)}</Text>
            <Text muted>of {formatKcal(GOAL)}</Text>
          </View>
          <Bar pct={Math.min(100, Math.round((state.steps / GOAL) * 100))} height={10} color={colors.inkBlue} label="Steps toward today's goal" />
        </>
      )}
    </Card>
  );
}
