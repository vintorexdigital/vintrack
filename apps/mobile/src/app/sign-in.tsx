import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput } from 'react-native';
import { ApiError, type Company } from '@/core';
import { useSession } from '@/session';
import { TOUCH, space, usePalette } from '@/theme';
import { Banner, Button, Card, Row, Screen, T } from '@/ui';

export default function SignIn() {
  const s = useSession();
  const p = usePalette();
  const [tenant, setTenant] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [choose, setChoose] = useState<{ token: string; companies: Company[] }>();

  const input = { minHeight: TOUCH, borderWidth: 1, borderColor: p.rule, borderRadius: 10, paddingHorizontal: space.md, color: p.ink, backgroundColor: p.surface, fontSize: 16 } as const;
  const run = async (fn: () => Promise<{ status: string; selectionToken?: string; companies?: Company[] }>) => {
    setBusy(true); setError('');
    try {
      const r = await fn();
      if (r.status === 'choose_company') setChoose({ token: r.selectionToken!, companies: r.companies! });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the server. Check your connection and try again.');
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: p.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
        <Screen style={{ flex: 0 }}>
          <T size={28} bold accessibilityRole="header">Trackrex</T>
          <T muted>Sign in to punch, see your tasks and manage leave.</T>
          {error ? <Banner tone="error">{error}</Banner> : null}
          {choose ? (
            <Card>
              <T bold>Choose a company</T>
              {choose.companies.map((c) => <Button key={c.id} title={c.name} variant="secondary" loading={busy} onPress={() => void run(() => s.selectCompany(choose.token, c.id))} />)}
            </Card>
          ) : (
            <Card>
              <T muted size={13}>Company address</T>
              <TextInput accessibilityLabel="Company address" style={input} value={tenant} onChangeText={setTenant} autoCapitalize="none" autoCorrect={false} placeholder="your-company" placeholderTextColor={p.muted} />
              <T muted size={13}>Email or mobile number</T>
              <TextInput accessibilityLabel="Email or mobile number" style={input} value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" />
              <T muted size={13}>Password</T>
              <TextInput accessibilityLabel="Password" style={input} value={password} onChangeText={setPassword} secureTextEntry textContentType="password" />
              <Row><Button title="Sign in" loading={busy} disabled={!tenant || !identifier || !password} onPress={() => void run(() => s.signIn({ tenant: tenant.trim(), identifier: identifier.trim(), password }))} /></Row>
            </Card>
          )}
        </Screen>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
