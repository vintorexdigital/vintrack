import { useState } from 'react';
import { useSession } from './session';
import { Banner, Button, Card, Row, T } from './ui';

/** What is waiting to be sent, and anything the server refused, so nothing a person did ever just vanishes. */
export function SyncStatus() {
  const s = useSession();
  const [busy, setBusy] = useState(false);
  const pending = s.queue.pending();
  const failed = s.queue.failed();
  if (!pending.length && !failed.length) return null;
  return (
    <Card>
      {pending.length > 0 && (
        <>
          <Banner tone="warn">{pending.length} {pending.length === 1 ? 'item is' : 'items are'} saved on this phone and will be sent when you are online.</Banner>
          <Button title="Send now" variant="secondary" loading={busy} onPress={() => { setBusy(true); void s.sync().finally(() => setBusy(false)); }} />
        </>
      )}
      {failed.map((f) => (
        <Card key={f.id} style={{ gap: 4 }}>
          <T bold>{f.label}</T>
          <T muted size={14}>{f.error}</T>
          <Row><Button title="Dismiss" variant="secondary" onPress={() => void s.queue.dismissFailed(f.id)} /></Row>
        </Card>
      ))}
    </Card>
  );
}
