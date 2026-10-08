import { z } from 'zod';

import { QUESTION_TYPES, type Question } from '@trackrex/rules';
export { QUESTION_TYPES, FORM_PHOTO_KEY, validateAnswers, visibleQuestions } from '@trackrex/rules';
export type { Answers, AnswerValue, AnswerCheck, Question, QuestionType } from '@trackrex/rules';

const optionSchema = z.object({ value: z.string().trim().min(1).max(60), label: z.string().trim().min(1).max(120) });
const answerValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);

export const questionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'Use lower-case letters, digits and underscores, starting with a letter'),
  label: z.string().trim().min(1, 'Add the question').max(200),
  type: z.enum(QUESTION_TYPES),
  required: z.boolean().default(false),
  help: z.string().trim().max(300).optional(),
  options: z.array(optionSchema).max(30).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  /** Show this question only when another question has this answer. */
  showIf: z.object({ questionId: z.string(), equals: answerValue }).optional(),
});

export const questionsSchema = z.array(questionSchema).min(1, 'Add at least one question').max(40).superRefine((qs, ctx) => {
  const seen = new Set<string>();
  qs.forEach((q, i) => {
    if (seen.has(q.id)) ctx.addIssue({ code: 'custom', path: [i, 'id'], message: 'Question ids must be unique' });
    seen.add(q.id);
    if ((q.type === 'select' || q.type === 'multiselect') && (q.options?.length ?? 0) < 2) ctx.addIssue({ code: 'custom', path: [i, 'options'], message: 'Give at least two options' });
    if (q.showIf && !qs.slice(0, i).some((p) => p.id === q.showIf!.questionId)) ctx.addIssue({ code: 'custom', path: [i, 'showIf'], message: 'Can only depend on an earlier question' });
  });
});

export const answersSchema = z.record(z.string(), answerValue);

export const attachFormBody = z.object({ templateId: z.string().uuid() });
export const saveAnswersBody = z.object({ answers: answersSchema, submit: z.boolean().default(false) });
