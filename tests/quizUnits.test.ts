import { describe, expect, it } from 'vitest';
import { aiBlockerFor } from '../src/chat/availability';
import { QUIZ_MESSAGES } from '../src/constants';
import { answerText, correctText, isAnswered, UNANSWERED } from '../src/quizzes/answers';
import { defaultQuizForm, toQuizRequest, validateQuizForm, type QuizFormValues } from '../src/quizzes/quizForm';

const form = (overrides: Partial<QuizFormValues> = {}): QuizFormValues => ({ ...defaultQuizForm(), topic: 'Capitals', ...overrides });

describe('validateQuizForm', () => {
  it('accepts the defaults with a topic', () => {
    expect(validateQuizForm(form())).toEqual({});
  });

  it('needs a topic, or a material when the source is a material', () => {
    expect(validateQuizForm(form({ topic: '   ' })).topic).toBe('Enter a topic.');
    expect(validateQuizForm(form({ source: 'material', materialId: '' })).materialId).toBe('Choose a material.');
    expect(validateQuizForm(form({ source: 'material', materialId: 'm-1', topic: '' }))).toEqual({});
  });

  it('limits the topic length', () => {
    expect(validateQuizForm(form({ topic: 'x'.repeat(200) })).topic).toBeUndefined();
    expect(validateQuizForm(form({ topic: 'x'.repeat(201) })).topic).toContain('200');
  });

  it.each(['1', '20', ' 7 '])('accepts a count of %j', (count) => {
    expect(validateQuizForm(form({ count })).count).toBeUndefined();
  });

  it.each(['', '0', '21', '2.5', '-1', 'abc', '1e1'])('rejects a count of %j', (count) => {
    expect(validateQuizForm(form({ count })).count).toBe('Enter a whole number from 1 to 20.');
  });

  it('needs at least one question type', () => {
    expect(validateQuizForm(form({ types: [] })).types).toBe('Choose at least one question type.');
  });
});

describe('toQuizRequest', () => {
  it('sends a trimmed topic, with the types in a fixed order', () => {
    expect(toQuizRequest(form({ topic: '  Capitals  ', types: ['short_answer', 'multiple_choice'], count: ' 4 ', difficulty: 'hard' }))).toEqual({
      topic: 'Capitals',
      difficulty: 'hard',
      count: 4,
      types: ['multiple_choice', 'short_answer'],
    });
  });

  it('sends the material and no topic for a material quiz', () => {
    const request = toQuizRequest(form({ source: 'material', materialId: 'm-1', topic: 'ignored' }));
    expect(request).toEqual({ materialId: 'm-1', difficulty: 'medium', count: 5, types: ['multiple_choice', 'true_false', 'short_answer'] });
    expect(request).not.toHaveProperty('topic');
  });
});

describe('answer wording', () => {
  const options = ['Lyon', 'Paris'];

  it('words the learner answer for each type', () => {
    expect(answerText({ type: 'multiple_choice', options, answer: 1 })).toBe('Paris');
    expect(answerText({ type: 'multiple_choice', options, answer: 5 })).toBe('Option 6');
    expect(answerText({ type: 'true_false', answer: false })).toBe('False');
    expect(answerText({ type: 'true_false', answer: true })).toBe('True');
    expect(answerText({ type: 'short_answer', answer: 'Paris' })).toBe('Paris');
  });

  it('calls a missing or blank answer unanswered', () => {
    expect(answerText({ type: 'short_answer', answer: null })).toBe(UNANSWERED);
    expect(answerText({ type: 'short_answer', answer: '   ' })).toBe(UNANSWERED);
  });

  it('words the correct answer for each type', () => {
    expect(correctText({ options, correctAnswer: 0 })).toBe('Lyon');
    expect(correctText({ correctAnswer: 3 })).toBe('Option 4');
    expect(correctText({ correctAnswer: true })).toBe('True');
    expect(correctText({ correctAnswer: ['Paris', 'paree'] })).toBe('Paris / paree');
  });

  it('knows what counts as an answer', () => {
    for (const answered of [0, 1, true, false, 'x']) expect(isAnswered(answered)).toBe(true);
    for (const blank of [null, undefined, '', '  ']) expect(isAnswered(blank)).toBe(false);
  });
});

describe('aiBlockerFor', () => {
  const ready = { aiConfigured: true, emailVerified: true, notice: null };

  it('has no blocker when everything is available', () => {
    expect(aiBlockerFor(QUIZ_MESSAGES, ready)).toBeNull();
    expect(aiBlockerFor(QUIZ_MESSAGES, { ...ready, aiConfigured: undefined })).toBeNull();
  });

  it('puts a missing verification first, then configuration, budget and quota', () => {
    expect(aiBlockerFor(QUIZ_MESSAGES, { ...ready, emailVerified: false, aiConfigured: false })?.message).toBe(QUIZ_MESSAGES.notVerified);
    expect(aiBlockerFor(QUIZ_MESSAGES, { ...ready, aiConfigured: false })?.message).toBe(QUIZ_MESSAGES.notConfigured);
    expect(aiBlockerFor(QUIZ_MESSAGES, { ...ready, notice: { kind: 'unconfigured' } })?.message).toBe(QUIZ_MESSAGES.notConfigured);
    expect(aiBlockerFor(QUIZ_MESSAGES, { ...ready, notice: { kind: 'budget' } })?.message).toBe(QUIZ_MESSAGES.paused);
  });

  it('blocks on a quota until it resets, and reports when', () => {
    const now = Date.parse('2030-06-15T12:00:00.000Z');
    const later = now + 1000;
    expect(aiBlockerFor(QUIZ_MESSAGES, { ...ready, notice: { kind: 'quota', resetsAt: later } }, now)).toEqual({ message: QUIZ_MESSAGES.quota, resetsAt: later });
    expect(aiBlockerFor(QUIZ_MESSAGES, { ...ready, notice: { kind: 'quota', resetsAt: null } }, now)).toEqual({ message: QUIZ_MESSAGES.quota, resetsAt: null });
    expect(aiBlockerFor(QUIZ_MESSAGES, { ...ready, notice: { kind: 'quota', resetsAt: now - 1 } }, now)).toBeNull();
  });
});
