import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput } from 'react-native';
import { ApiError, type LeaveBalance } from '@trackrex/client-core';
import { useSession } from '@/session';
import { TOUCH, space, usePalette } from '@/theme';
import { Banner, Button, Card, Row, T } from '@/ui';

interface LeaveType { id: string; code: string; name: string }
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default function Leave() {
  const s = useSession();
  const p = usePalette();
  const qc = useQueryClient();
  const employeeId = s.me?.membership.employeeId;
  const balances = useQuery({ queryKey: ['balances'], queryFn: () => s.api.get<LeaveBalance[]>('/v1/leave/balances'), retry: false });
  const types = useQuery({ queryKey: ['leave-types'], queryFn: () => s.api.get<{ data: LeaveType[] }>('/v1/leave/types', { limit: 50 }), retry: false });
  const [typeId, setTypeId] = useState<string>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const input = { minHeight: TOUCH, borderWidth: 1, borderColor: p.rule, borderRadius: 10, paddingHorizontal: space.md, color: p.ink, fontSize: 16 } as const;
  const valid = !!employeeId && !!typeId && ISO.test(from) && ISO.test(to) && to >= from;

  // Leave rules (notice, balance, overlaps) are checked on the server, so this form needs a connection by design.
  const submit = async () => {
    setBusy(true); setSent(false);
    try {
      await s.api.post('/v1/leave/requests', { employeeId, leaveTypeId: typeId, fromDate: from, toDate: to, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      setSent(true); setFrom(''); setTo(''); setReason('');
      void qc.invalidateQueries({ queryKey: ['balances'] });
    } catch (e) {
      Alert.alert('Could not apply', e instanceof ApiError ? e.message : 'You need a connection to apply for leave.');
    } finally { setBusy(false); }
  };

  return (
    <ScrollView style={{ backgroundColor: p.canvas }} contentContainerStyle={{ padding: space.md, gap: space.md }} keyboardShouldPersistTaps="handled">
      <Card>
        <T bold size={17}>Balances</T>
        {balances.data?.map((b) => <Row key={b.code} style={{ justifyContent: 'space-between' }}><T>{b.name}</T><T bold>{b.balance}</T></Row>)}
        {balances.isError && <Banner tone="warn">Balances need a connection.</Banner>}
      </Card>
      <Card>
        <T bold size={17}>Apply for leave</T>
        <Row style={{ flexWrap: 'wrap' }}>
          {types.data?.data.map((t) => (
            <Pressable key={t.id} accessibilityRole="radio" accessibilityState={{ selected: typeId === t.id }} onPress={() => setTypeId(t.id)} style={{ minHeight: 40, paddingHorizontal: space.md, borderRadius: 20, justifyContent: 'center', borderWidth: 1, borderColor: typeId === t.id ? p.brand : p.rule, backgroundColor: typeId === t.id ? p.brand : p.surface }}>
              <T size={14} style={{ color: typeId === t.id ? p.onBrand : p.ink }}>{t.name}</T>
            </Pressable>
          ))}
        </Row>
        <T muted size={13}>From (YYYY-MM-DD)</T>
        <TextInput accessibilityLabel="From date" style={input} value={from} onChangeText={setFrom} placeholder="2026-03-16" placeholderTextColor={p.muted} autoCapitalize="none" />
        <T muted size={13}>To (YYYY-MM-DD)</T>
        <TextInput accessibilityLabel="To date" style={input} value={to} onChangeText={setTo} placeholder="2026-03-17" placeholderTextColor={p.muted} autoCapitalize="none" />
        <T muted size={13}>Reason (optional)</T>
        <TextInput accessibilityLabel="Reason" style={input} value={reason} onChangeText={setReason} />
        {sent && <Banner>Request sent to your manager.</Banner>}
        <Button title="Send request" disabled={!valid} loading={busy} onPress={() => void submit()} />
      </Card>
    </ScrollView>
  );
}
