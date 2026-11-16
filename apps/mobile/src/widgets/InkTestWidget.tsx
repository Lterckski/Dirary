import { FlexWidget, ImageWidget, TextWidget } from 'react-native-android-widget';
import { colors } from '@dirary/ui';

/** Phase 0 test widget. Widgets can't run normal React components, so Ink is a pre-rendered PNG here. */
export function InkTestWidget() {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent', width: 'match_parent', flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.surface, borderRadius: 28, padding: 16, flexGap: 14,
      }}>
      <FlexWidget style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.inkBlue, alignItems: 'center', justifyContent: 'center' }}>
        <ImageWidget image={require('../../assets/mascot/ink-happy.png')} imageWidth={66} imageHeight={66} />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'column', flexGap: 2 }}>
        <TextWidget text="Dirary" style={{ fontSize: 22, fontWeight: '800', color: colors.text }} />
        <TextWidget text="Ink says hi. Widgets work." style={{ fontSize: 13, color: colors.muted }} />
      </FlexWidget>
    </FlexWidget>
  );
}
