import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, FlatList, Modal, RefreshControl, TextInput, View } from 'react-native';
import { ApiError, sendOrQueue, type Task } from '@trackrex/client-core';
import { Crypto } from '@/ids';
import { currentPosition } from '@/location';
import { useSession } from '@/session';
import { SyncStatus } from '@/sync-status';
import { TOUCH, space, usePalette } from '@/theme';
import { Banner, Button, Card, Row, T } from '@/ui';

export default function Tasks() {
  const s = useSession();
  const p = usePalette();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [finishing, setFinishing] = useState<Task | null>(null);
  const [outcome, setOutcome] = useState('');
  const employeeId = s.me?.membership.employeeId;
  const q = useQuery({
    queryKey: ['my-tasks', employeeId], enabled: !!employeeId, retry: false,
    queryFn: () => s.api.get<{ data: Task[] }>('/v1/field/tasks', { 'filter[assigneeId][eq]': employeeId!, 'filter[status][in]': 'open,in_progress', sort: 'dueAt', limit: 100 }),
  });
  const deps = { api: s.api, queue: s.queue, newId: Crypto.randomUUID };

  const act = async (t: Task, kind: 'check-in' | 'complete') => {
    setBusy(t.id);
    try {
      const pos = await currentPosition();
      const body = kind === 'check-in' ? { ...(pos ? { latitude: pos.latitude, longitude: pos.longitude, accuracy: pos.accuracy ?? undefined } : {}) } : { outcome, ...(pos ? { latitude: pos.latitude, longitude: pos.longitude } : {}) };
      const out = await sendOrQueue<{ warnings?: string[] }>(deps, { path: `/v1/field/tasks/${t.id}/${kind}`, body, label: `${kind === 'check-in' ? 'Start' : 'Complete'} “${t.title}”` });
      if (out.status === 'sent' && out.result.warnings?.includes('far_from_customer')) Alert.alert('Far from the customer', 'You were further from the customer than your company allows. Your manager can see the distance.');
      if (out.status === 'queued') Alert.alert('Saved on this phone', 'It will be sent when you are back online.');
      setFinishing(null); setOutcome('');
      void qc.invalidateQueries({ queryKey: ['my-tasks'] });
    } catch (e) {
      Alert.alert('Could not update the task', e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally { setBusy(null); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: p.canvas }}>
      <FlatList
        data={q.data?.data ?? []} keyExtractor={(t) => t.id} contentContainerStyle={{ padding: space.md, gap: space.md }}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => void q.refetch()} />}
        ListHeaderComponent={<SyncStatus />}
        ListEmptyComponent={q.isLoading ? null : <Card><T bold>Nothing assigned</T><T muted>New tasks from your manager appear here.</T></Card>}
        renderItem={({ item: t }) => {
          const overdue = !!t.dueAt && new Date(t.dueAt).getTime() < Date.now();
          return (
            <Card>
              <T bold size={17}>{t.title}</T>
              <T muted size={13}>{t.code} · {t.taskType}{t.priority !== 'normal' ? ` · ${t.priority}` : ''}</T>
              {t.description ? <T size={14}>{t.description}</T> : null}
              <T size={13} style={{ color: overdue ? p.absent : p.muted }}>{t.dueAt ? `${overdue ? 'Overdue · ' : 'Due '}${new Date(t.dueAt).toLocaleString()}` : 'No due time'}</T>
              {t.status === 'open' && <Button title="Start and check in" loading={busy === t.id} onPress={() => void act(t, 'check-in')} />}
              {t.status === 'in_progress' && <Button title="Complete" onPress={() => setFinishing(t)} />}
            </Card>
          );
        }}
      />
      <Modal visible={!!finishing} transparent animationType="slide" onRequestClose={() => setFinishing(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: p.surface, padding: space.md, gap: space.sm, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
            <T bold size={18}>Complete “{finishing?.title}”</T>
            <T muted size={14}>Say how it went. Your location is attached if you allowed it.</T>
            <TextInput accessibilityLabel="Outcome" multiline value={outcome} onChangeText={setOutcome} style={{ minHeight: TOUCH * 2, borderWidth: 1, borderColor: p.rule, borderRadius: 10, padding: space.sm + 4, color: p.ink, textAlignVertical: 'top' }} />
            <Row style={{ justifyContent: 'flex-end' }}>
              <Button title="Cancel" variant="secondary" onPress={() => setFinishing(null)} />
              <Button title="Mark complete" disabled={outcome.trim().length < 2} loading={busy === finishing?.id} onPress={() => finishing && void act(finishing, 'complete')} />
            </Row>
            {busy === null ? null : <Banner>Saving…</Banner>}
          </View>
        </View>
      </Modal>
    </View>
  );
}
