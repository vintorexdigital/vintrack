import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { isNetworkError, sendOrQueue, type Task } from '@trackrex/client-core';
import { validateAnswers, visibleQuestions, type Answers, type AnswerValue, type Question } from '@trackrex/forms';
import { Crypto } from '@/ids';
import { SelfieCapture } from '@/selfie';
import { useSession } from '@/session';
import { TOUCH, space, usePalette } from '@/theme';
import { Banner, Button, Row, T } from '@/ui';

export interface TaskFormView { templateName: string; questions: Question[]; requiredToComplete: boolean; answers: Answers; status: 'draft' | 'submitted' }

export const useTaskForm = (taskId: string) => {
  const s = useSession();
  return useQuery({ queryKey: ['task-form', taskId], retry: false, queryFn: () => s.api.get<{ form: TaskFormView | null }>(`/v1/field/tasks/${taskId}/form`) });
};

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={label} onPress={onPress}
      style={{ minHeight: TOUCH, minWidth: TOUCH, paddingHorizontal: space.md, justifyContent: 'center', alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: on ? p.brand : p.rule, backgroundColor: on ? p.brand : p.surface }}>
      <T style={{ color: on ? p.onBrand : p.ink }}>{label}</T>
    </Pressable>
  );
}

/** Fill a task's form on the phone. Works offline: the answers (and any photos) are queued and sent in order. */
export function TaskFormModal({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const s = useSession();
  const p = usePalette();
  const qc = useQueryClient();
  const q = useTaskForm(task?.id ?? '');
  const form = task ? q.data?.form : null;
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [photoFor, setPhotoFor] = useState<Question | null>(null);
  useEffect(() => { if (form) setAnswers(form.answers); }, [form]);
  const set = (id: string, v: AnswerValue | undefined) => setAnswers((a) => { const n = { ...a }; if (v === undefined || v === '') delete n[id]; else n[id] = v; return n; });

  const addPhoto = async (q2: Question, b64: string) => {
    setPhotoFor(null);
    if (!s.me?.user) return;
    const key = `forms/${s.me.company.id}/${s.me.user.id}/${Crypto.randomUUID()}.jpg`;
    try {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      await s.api.putBytes(`/v1/files/${key}`, bytes, 'image/jpeg');
    } catch (e) {
      if (!isNetworkError(e)) { Alert.alert('Could not upload the photo', 'Try again.'); return; }
      const blobId = Crypto.randomUUID();
      await s.blobs.put(blobId, b64);
      await s.queue.enqueue({ method: 'PUT', path: `/v1/files/${key}`, blob: { id: blobId, contentType: 'image/jpeg' }, label: 'Photo upload' });
    }
    set(q2.id, key);
  };

  const save = async (submit: boolean) => {
    if (!task || !form) return;
    if (submit) { const check = validateAnswers(form.questions, answers, { final: true }); setErrors(check.errors); if (!check.ok) return; }
    setBusy(true);
    try {
      const out = await sendOrQueue(
        { api: s.api, queue: s.queue, newId: Crypto.randomUUID },
        { path: `/v1/field/tasks/${task.id}/form/answers`, body: { answers, submit }, label: `${submit ? 'Submit' : 'Save'} form for “${task.title}”` },
      );
      if (out.status === 'queued') Alert.alert('Saved on this phone', 'It will be sent when you are back online.');
      void qc.invalidateQueries({ queryKey: ['task-form', task.id] });
      if (submit) onClose();
    } catch (e) {
      Alert.alert('Could not save the form', e instanceof Error ? e.message : 'Something went wrong.');
    } finally { setBusy(false); }
  };

  const input = { minHeight: TOUCH, borderWidth: 1, borderColor: p.rule, borderRadius: 10, padding: space.sm + 4, color: p.ink } as const;
  return (
    <Modal visible={!!task} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: p.canvas }}>
        <ScrollView contentContainerStyle={{ padding: space.md, gap: space.md }} keyboardShouldPersistTaps="handled">
          <T bold size={20}>{form?.templateName ?? 'Form'}</T>
          {q.isError ? <Banner tone="warn">The form could not be loaded. Open it once while online; after that your answers can be saved offline.</Banner> : null}
          {form && visibleQuestions(form.questions, answers).map((qn) => {
            const v = answers[qn.id];
            return (
              <View key={qn.id} style={{ gap: space.xs }}>
                <T bold>{qn.label}{qn.required ? ' *' : ''}</T>
                {qn.help ? <T muted size={13}>{qn.help}</T> : null}
                {(qn.type === 'text' || qn.type === 'textarea') && <TextInput accessibilityLabel={qn.label} multiline={qn.type === 'textarea'} value={(v as string) ?? ''} onChangeText={(t) => set(qn.id, t)} style={[input, qn.type === 'textarea' ? { minHeight: TOUCH * 2, textAlignVertical: 'top' } : null]} />}
                {qn.type === 'number' && <TextInput accessibilityLabel={qn.label} keyboardType="decimal-pad" value={v === undefined ? '' : String(v)} onChangeText={(t) => set(qn.id, t.trim() === '' ? undefined : Number(t))} style={input} />}
                {qn.type === 'date' && <TextInput accessibilityLabel={`${qn.label} (YYYY-MM-DD)`} placeholder="YYYY-MM-DD" value={(v as string) ?? ''} onChangeText={(t) => set(qn.id, t)} style={input} />}
                {qn.type === 'yes_no' && <Row><Chip label="Yes" on={v === true} onPress={() => set(qn.id, true)} /><Chip label="No" on={v === false} onPress={() => set(qn.id, false)} /></Row>}
                {qn.type === 'rating' && <Row style={{ flexWrap: 'wrap' }}>{Array.from({ length: qn.max ?? 5 }, (_, i) => i + 1).map((n) => <Chip key={n} label={String(n)} on={v === n} onPress={() => set(qn.id, n)} />)}</Row>}
                {qn.type === 'select' && <Row style={{ flexWrap: 'wrap' }}>{qn.options?.map((o) => <Chip key={o.value} label={o.label} on={v === o.value} onPress={() => set(qn.id, o.value)} />)}</Row>}
                {qn.type === 'multiselect' && <Row style={{ flexWrap: 'wrap' }}>{qn.options?.map((o) => { const cur = (v as string[] | undefined) ?? []; return <Chip key={o.value} label={o.label} on={cur.includes(o.value)} onPress={() => set(qn.id, cur.includes(o.value) ? cur.filter((x) => x !== o.value) : [...cur, o.value])} />; })}</Row>}
                {qn.type === 'photo' && <Row><Button title={v ? 'Retake photo' : 'Take photo'} variant="secondary" onPress={() => setPhotoFor(qn)} />{v ? <T muted size={13}>Photo added</T> : null}</Row>}
                {errors[qn.id] ? <T size={13} style={{ color: p.absent }}>{errors[qn.id]}</T> : null}
              </View>
            );
          })}
        </ScrollView>
        <Row style={{ padding: space.md, justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: p.rule, backgroundColor: p.surface }}>
          <Button title="Close" variant="secondary" onPress={onClose} />
          <Row>
            <Button title="Save draft" variant="secondary" disabled={!form || busy} onPress={() => void save(false)} />
            <Button title="Submit" disabled={!form} loading={busy} onPress={() => void save(true)} />
          </Row>
        </Row>
        <SelfieCapture visible={!!photoFor} title={photoFor?.label ?? 'Take a photo'} facing="back" hint="Allow camera access to attach a photo." onCancel={() => setPhotoFor(null)} onCapture={(b64) => photoFor && void addPhoto(photoFor, b64)} />
      </View>
    </Modal>
  );
}
