import { describe, expect, it } from 'vitest';
import { questionsSchema, validateAnswers, visibleQuestions, type Question } from './forms.js';

const Q = (over: Partial<Question> & Pick<Question, 'id' | 'type'>): Question => ({ label: over.id, required: false, ...over });

describe('form definitions', () => {
  it('accepts a good form and rejects duplicate ids, thin option lists and forward references', () => {
    expect(questionsSchema.safeParse([Q({ id: 'a', type: 'text' })]).success).toBe(true);
    expect(questionsSchema.safeParse([]).success).toBe(false);
    expect(questionsSchema.safeParse([Q({ id: 'a', type: 'text' }), Q({ id: 'a', type: 'text' })]).success).toBe(false);
    expect(questionsSchema.safeParse([Q({ id: 'a', type: 'select', options: [{ value: 'x', label: 'X' }] })]).success).toBe(false);
    expect(questionsSchema.safeParse([Q({ id: 'a', type: 'text', showIf: { questionId: 'b', equals: true } }), Q({ id: 'b', type: 'yes_no' })]).success).toBe(false);
    expect(questionsSchema.safeParse([Q({ id: 'Bad Id', type: 'text' })]).success).toBe(false);
  });
});

describe('answers', () => {
  const qs: Question[] = [
    Q({ id: 'stock', type: 'number', required: true, min: 0, max: 1000 }),
    Q({ id: 'issue', type: 'yes_no', required: true }),
    Q({ id: 'detail', type: 'textarea', required: true, showIf: { questionId: 'issue', equals: true } }),
    Q({ id: 'mood', type: 'rating' }),
    Q({ id: 'kind', type: 'select', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }),
    Q({ id: 'tags', type: 'multiselect', options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }] }),
    Q({ id: 'seen', type: 'date' }),
  ];

  it('hides questions whose condition is not met, and does not require them', () => {
    expect(visibleQuestions(qs, { issue: false }).map((q) => q.id)).not.toContain('detail');
    const ok = validateAnswers(qs, { stock: 10, issue: false, detail: 'ignored' }, { final: true });
    expect(ok.ok).toBe(true);
    expect(ok.answers).toEqual({ stock: 10, issue: false });
    const missing = validateAnswers(qs, { stock: 10, issue: true }, { final: true });
    expect(missing.errors).toEqual({ detail: 'This is required' });
  });

  it('checks types and ranges', () => {
    const r = validateAnswers(qs, { stock: 5000, issue: 'yes', mood: 7, kind: 'z', tags: ['x', 'q'], seen: 'tomorrow' } as never, { final: true });
    expect(Object.keys(r.errors).sort()).toEqual(['issue', 'kind', 'mood', 'seen', 'stock', 'tags']);
    const good = validateAnswers(qs, { stock: 0, issue: false, mood: 4, kind: 'a', tags: ['x', 'x', 'y'], seen: '2026-10-01' }, { final: true });
    expect(good.ok).toBe(true);
    expect(good.answers.tags).toEqual(['x', 'y']);
  });

  it('lets a draft be incomplete but still rejects wrong types', () => {
    expect(validateAnswers(qs, { stock: 3 }, { final: false }).ok).toBe(true);
    expect(validateAnswers(qs, { stock: 'many' } as never, { final: false }).errors.stock).toBe('Enter a number');
  });

  it('only accepts photo keys of the expected shape', () => {
    const q = [Q({ id: 'shelf', type: 'photo', required: true })];
    const id = '123e4567-e89b-12d3-a456-426614174000';
    expect(validateAnswers(q, { shelf: `forms/${id}/${id}/${id}.jpg` }, { final: true }).ok).toBe(true);
    expect(validateAnswers(q, { shelf: '../../etc/passwd' }, { final: true }).ok).toBe(false);
  });
});
