import type { AnswerValue, QuizResult } from '../api/quizzes';

export const UNANSWERED = 'Unanswered';

const optionText = (options: string[] | undefined, index: number): string => options?.[index] ?? `Option ${index + 1}`;

const truthText = (value: boolean): string => (value ? 'True' : 'False');

// The learner's answer as words, whatever the question type.
export function answerText(result: Pick<QuizResult, 'type' | 'options' | 'answer'>): string {
  const { answer } = result;
  if (answer === null || (typeof answer === 'string' && answer.trim() === '')) return UNANSWERED;
  if (typeof answer === 'number') return optionText(result.options, answer);
  if (typeof answer === 'boolean') return truthText(answer);
  return answer;
}

// What was right, as words; a short answer lists every accepted answer.
export function correctText(result: Pick<QuizResult, 'options' | 'correctAnswer'>): string {
  const { correctAnswer } = result;
  if (Array.isArray(correctAnswer)) return correctAnswer.join(' / ');
  if (typeof correctAnswer === 'number') return optionText(result.options, correctAnswer);
  return truthText(correctAnswer);
}

export const isAnswered = (answer: AnswerValue | null | undefined): answer is AnswerValue => answer !== null && answer !== undefined && !(typeof answer === 'string' && answer.trim() === '');
