/**
 * The widget check on Today: draws the Today's tasks widget right here (the same drawing the home screen
 * gets), lists what the home-screen widgets last did, and redraws them on request. If the drawing shows
 * here but not on the home screen, the home screen isn't showing the picture; if the list is empty,
 * Android never woke Dirary up to draw.
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { WidgetPreview } from 'react-native-android-widget';
import { colors, space } from '@dirary/ui';
import { PopUp } from '@/components/pop-up';
import { Button, Card, Text } from '@/components/ui';
import { safeWidgetData, type WidgetData } from '@/widgets/data';
import { describe, logWidget, readWidgetLog, type WidgetLogEntry } from '@/widgets/log';
import { refreshWidgets } from '@/widgets/refresh';
import { TodayTasksWidget } from '@/widgets/TodayTasksWidget';

export function WidgetCheck({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<WidgetData | null>(null);
  const [log, setLog] = useState<WidgetLogEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setData(await safeWidgetData());
    setLog(await readWidgetLog());
  }, []);
  useEffect(() => { load(); }, [load]);

  async function redraw() {
    setBusy(true);
    try {
      await refreshWidgets();
      await logWidget({ widget: 'all', action: 'redraw from app', ok: true });
    } catch (error) {
      await logWidget({ widget: 'all', action: 'redraw from app', ok: false, note: describe(error) });
    }
    await load();
    setBusy(false);
  }

  return (
    <PopUp onClose={onClose}>
      <ScrollView contentContainerStyle={{ padding: space[5], gap: space[4] }}>
        <Text variant="title" weight="bold">Widget check</Text>
        <Text muted>This is the Today's tasks widget, drawn here the way it's drawn for your home screen.</Text>
        <View style={{ alignItems: 'center' }}>
          {data ? (
            <WidgetPreview width={320} height={180} renderWidget={() => <TodayTasksWidget data={data} />} />
          ) : <Text muted>Loading…</Text>}
        </View>
        <Button primary label={busy ? 'Redrawing…' : 'Redraw home-screen widgets'} disabled={busy} onPress={redraw} />
        <Card>
          <Text variant="small" weight="bold" style={{ color: colors.muted }}>WHAT THE WIDGETS DID</Text>
          {log.length === 0 ? (
            <Text muted>Nothing yet. Android hasn't asked Dirary to draw a widget since this version was installed.</Text>
          ) : log.slice(0, 15).map((e, i) => (
            <Text key={`${e.at}-${i}`} variant="label" style={{ color: e.ok ? colors.text : colors.red }}>
              {new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })} · {e.widget} · {e.action}{e.ok ? ' · ok' : ` · ${e.note ?? 'failed'}`}
            </Text>
          ))}
        </Card>
        <Button label="Close" onPress={onClose} />
      </ScrollView>
    </PopUp>
  );
}
