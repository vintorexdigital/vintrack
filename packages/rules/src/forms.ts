/* Task form rules: pure, dependency-free, shared by the API, the web console and the mobile app. */
export const QUESTION_TYPES = ['text', 'textarea', 'number', 'yes_no', 'select', 'multiselect', 'date', 'rating', 'photo'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export type AnswerValue = string | number | boolean | string[];
export type Answers = Record<string, AnswerValue>;

export interface Question {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  help?: string | undefined;
  options?: { value: string; label: string }[] | undefined;
  min?: number | undefined;
  max?: number | undefined;
  /** Show this question only when another question has this answer. */
  showIf?: { questionId: string; equals: AnswerValue } | undefined;
}

/** Where photo answers live: the signed-in person's own folder, like selfies. */
export const FORM_PHOTO_KEY = /^forms\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/;

/** The questions that apply given the answers so far (a question hidden by `showIf` is neither shown nor required). */
export function visibleQuestions(questions: Question[], answers: Answers): Question[] {
  const sameAnswer = (a: AnswerValue | undefined, b: AnswerValue) => (Array.isArray(a) ? Array.isArray(b) ? a.join() === b.join() : a.includes(String(b)) : a === b);
  return questions.filter((q) => !q.showIf || sameAnswer(answers[q.showIf.questionId], q.showIf.equals));
}

export interface AnswerCheck {
  ok: boolean;
  /** Question id to message. */
  errors: Record<string, string>;
  /** Only answers to visible questions, trimmed and typed. */
  answers: Answers;
}

/** One validation for the API, the web form and the mobile form. `final: false` is for drafts: types are checked, required is not. */
export function validateAnswers(questions: Question[], raw: Answers, o: { final: boolean }): AnswerCheck {
  const errors: Record<string, string> = {};
  const out: Answers = {};
  for (const q of visibleQuestions(questions, raw)) {
    const v = raw[q.id];
    const empty = v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty) { if (q.required && o.final) errors[q.id] = 'This is required'; continue; }
    switch (q.type) {
      case 'text': case 'textarea': {
        if (typeof v !== 'string') { errors[q.id] = 'Enter text'; break; }
        const t = v.trim();
        if (t.length > (q.type === 'text' ? 300 : 4000)) errors[q.id] = 'That is too long'; else out[q.id] = t;
        break;
      }
      case 'number': {
        if (typeof v !== 'number' || !Number.isFinite(v)) { errors[q.id] = 'Enter a number'; break; }
        if (q.min !== undefined && v < q.min) errors[q.id] = `Must be at least ${q.min}`;
        else if (q.max !== undefined && v > q.max) errors[q.id] = `Must be at most ${q.max}`;
        else out[q.id] = v;
        break;
      }
      case 'rating': {
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > (q.max ?? 5)) errors[q.id] = `Choose 1 to ${q.max ?? 5}`; else out[q.id] = v;
        break;
      }
      case 'yes_no': if (typeof v !== 'boolean') errors[q.id] = 'Choose yes or no'; else out[q.id] = v; break;
      case 'date': if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) errors[q.id] = 'Enter a date'; else out[q.id] = v; break;
      case 'select': if (typeof v !== 'string' || !q.options?.some((x) => x.value === v)) errors[q.id] = 'Choose one of the options'; else out[q.id] = v; break;
      case 'multiselect': {
        if (!Array.isArray(v) || v.some((x) => !q.options?.some((o2) => o2.value === x))) errors[q.id] = 'Choose from the options'; else out[q.id] = [...new Set(v)];
        break;
      }
      case 'photo': if (typeof v !== 'string' || !FORM_PHOTO_KEY.test(v)) errors[q.id] = 'Attach a photo'; else out[q.id] = v; break;
    }
  }
  return { ok: Object.keys(errors).length === 0, errors, answers: out };
}

