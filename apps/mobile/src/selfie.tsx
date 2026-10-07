import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Modal, View } from 'react-native';
import { space } from './theme';
import { Banner, Button, Row, T } from './ui';

/** Front-camera capture. Resolves with a JPEG as base64. Low quality on purpose: it is proof of presence, not a portrait. */
export function SelfieCapture({ visible, onCapture, onCancel, title = 'Take a selfie to punch', facing = 'front', hint = 'Your shift needs a selfie with each punch. Allow camera access to continue.' }: { visible: boolean; onCapture: (base64: string) => void; onCancel: () => void; title?: string; facing?: 'front' | 'back'; hint?: string }) {
  const ref = useRef<CameraView>(null);
  const [perm, ask] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const snap = async () => {
    setBusy(true); setError('');
    try {
      const shot = await ref.current?.takePictureAsync({ quality: 0.35, base64: true, skipProcessing: true, imageType: 'jpg' });
      const raw = shot?.base64 ?? '';
      const b64 = raw.replace(/^data:image\/\w+;base64,/, '');
      if (!b64) throw new Error('empty');
      onCapture(b64);
    } catch {
      setError('Could not take the photo. Try again.');
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: '#000', padding: space.md, gap: space.md }}>
        <T bold size={18} style={{ color: '#fff' }}>{title}</T>
        {perm?.granted ? (
          <CameraView ref={ref} facing={facing} style={{ flex: 1, borderRadius: 12, overflow: 'hidden' }} />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', gap: space.md }}>
            <T style={{ color: '#fff' }}>{hint}</T>
            <Button title="Allow camera" onPress={() => void ask()} />
          </View>
        )}
        {error ? <Banner tone="error">{error}</Banner> : null}
        <Row style={{ justifyContent: 'space-between' }}>
          <Button title="Cancel" variant="secondary" onPress={onCancel} />
          <Button title="Take photo" disabled={!perm?.granted} loading={busy} onPress={() => void snap()} />
        </Row>
      </View>
    </Modal>
  );
}
