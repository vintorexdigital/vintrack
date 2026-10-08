import { ScrollView } from 'react-native';
import { useSession, API_URL } from '@/session';
import { SyncStatus } from '@/sync-status';
import { space, usePalette } from '@/theme';
import { Button, Card, Row, T } from '@/ui';

export default function Profile() {
  const s = useSession();
  const p = usePalette();
  return (
    <ScrollView style={{ backgroundColor: p.canvas }} contentContainerStyle={{ padding: space.md, gap: space.md }}>
      <Card>
        <T bold size={20}>{s.me?.user?.name}</T>
        <T muted>{s.me?.user?.email}</T>
        <T muted size={14}>{s.me?.company.name} · {s.me?.membership.roleKeys.join(', ')}</T>
      </Card>
      <Card>
        <T bold>Sync</T>
        <Row style={{ justifyContent: 'space-between' }}><T muted>Waiting to send</T><T>{s.queue.size}</T></Row>
        <Row style={{ justifyContent: 'space-between' }}><T muted>Needs attention</T><T>{s.queue.failed().length}</T></Row>
        <Row style={{ justifyContent: 'space-between' }}><T muted>Server</T><T size={12}>{API_URL}</T></Row>
      </Card>
      <SyncStatus />
      <Button title="Sign out" variant="secondary" onPress={() => void s.signOut()} />
    </ScrollView>
  );
}
