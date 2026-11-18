/** A full-screen camera that reads one food barcode, with a box to type the number when the camera can't. */
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Press } from '@/components/press';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space } from '@dirary/ui';
import { isBarcode } from '@dirary/shared';

import { Button, Text, styles } from '@/components/ui';
import { PopUp } from '@/components/pop-up';

export function BarcodeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [typed, setTyped] = useState('');
  const done = useRef(false);
  const insets = useSafeAreaInsets();

  function finish(code: string) {
    if (done.current) return;
    done.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onCode(code);
  }

  return (
    <PopUp onClose={onClose} navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.night }}>
        {permission?.granted ? (
          <CameraView style={{ flex: 1 }} facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={({ data }) => { const code = data.replace(/\D/g, ''); if (isBarcode(code)) finish(code); }} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[6], gap: space[4] }}>
            <Text variant="heading" style={{ textAlign: 'center' }}>Scan a barcode</Text>
            <Text muted style={{ textAlign: 'center' }}>
              {permission && !permission.canAskAgain ? 'Camera access is off for Dirary. Turn it on in Settings › Apps › Dirary › Permissions, or type the number below.' : 'Dirary needs the camera to read the barcode on the pack.'}
            </Text>
            {(!permission || permission.canAskAgain) && <Button primary label="Allow camera" onPress={requestPermission} />}
          </View>
        )}

        {permission?.granted && (
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: '78%', aspectRatio: 1.7, borderRadius: radius.widget, borderWidth: 3, borderColor: colors.inkBlue }} />
            <Text weight="semi" style={{ marginTop: space[4], color: colors.text, textShadowColor: '#000', textShadowRadius: 6 }}>Line up the barcode in the box</Text>
          </View>
        )}

        <Press accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8}
          style={{ position: 'absolute', top: insets.top + space[3], right: space[4], width: 48, height: 48, borderRadius: 24, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="heading">✕</Text>
        </Press>

        <View style={{ position: 'absolute', left: space[4], right: space[4], bottom: insets.bottom + space[4], flexDirection: 'row', gap: space[2], padding: space[2], borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
          <TextInput accessibilityLabel="Barcode number" value={typed} onChangeText={(t) => setTyped(t.replace(/\D/g, '').slice(0, 14))} keyboardType="number-pad"
            placeholder="Or type the number" placeholderTextColor={colors.faint} style={[styles.input, { flex: 1, borderWidth: 0, backgroundColor: 'transparent' }]}
            onSubmitEditing={() => isBarcode(typed) && finish(typed)} />
          <Button primary label="Look up" disabled={!isBarcode(typed)} onPress={() => finish(typed)} />
        </View>
      </View>
    </PopUp>
  );
}
