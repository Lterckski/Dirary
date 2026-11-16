import { View } from 'react-native';
import { colors, space } from '@dirary/ui';

import { Mascot } from '@/components/mascot';
import { Card, Text, styles } from '@/components/ui';

export function ComingSoon({ phase, line }: { phase: string; line: string }) {
  return (
    <View style={[styles.screen, { padding: space[5], justifyContent: 'center' }]}>
      <Card style={{ alignItems: 'center', paddingVertical: space[10] }}>
        <Mascot mood="sleepy" size={160} />
        <Text variant="label" weight="semi" style={{ color: colors.inkBlue, letterSpacing: 1.2 }}>{phase.toUpperCase()}</Text>
        <Text muted style={{ textAlign: 'center' }}>{line}</Text>
      </Card>
    </View>
  );
}
