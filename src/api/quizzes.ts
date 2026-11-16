import { API_PREFIX } from '../constants';
import { apiFetch } from './client';
import type { components } from './schema';

export type Quiz = components['schemas']['Quiz'];
export type QuizSummary = components['schemas']['QuizSummary'];
export type QuizQuestion = components['schemas']['QuizQuestion'];
export type CreateQuizRequest = components['schemas']['CreateQuizRequest'];
export type Attempt = components['schemas']['Attempt'];
export type AttemptSummary = components['schemas']['AttemptSummary'];
export type AnswerInput = components['schemas']['AnswerInput'];
export type QuizResult = components['schemas']['QuizResult'];
export type AnswerValue = NonNullable<AnswerInput['answer']>;

const json = (method: 'POST' | 'PUT', payload: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const quizzes = `${API_PREFIX}/quizzes`;
const quizUrl = (id: string) => `${quizzes}/${encodeURIComponent(id)}`;
const attemptUrl = (id: string) => `${API_PREFIX}/attempts/${encodeURIComponent(id)}`;

export const listQuizzes = (signal?: AbortSignal): Promise<{ items: QuizSummary[] }> =>
  apiFetch<{ items: QuizSummary[] }>(quizzes, signal ? { signal } : {});

export const getQuiz = (id: string, signal?: AbortSignal): Promise<Quiz> => apiFetch<Quiz>(quizUrl(id), signal ? { signal } : {});

export const createQuiz = (request: CreateQuizRequest): Promise<Quiz> => apiFetch<Quiz>(quizzes, json('POST', request));

// Resumes the quiz's unsubmitted attempt, or starts a new one.
export const startAttempt = (quizId: string): Promise<Attempt> => apiFetch<Attempt>(`${quizUrl(quizId)}/attempts`, { method: 'POST' });

export const listAttempts = (quizId: string, signal?: AbortSignal): Promise<{ items: AttemptSummary[] }> =>
  apiFetch<{ items: AttemptSummary[] }>(`${quizUrl(quizId)}/attempts`, signal ? { signal } : {});

export const getAttempt = (id: string, signal?: AbortSignal): Promise<Attempt> => apiFetch<Attempt>(attemptUrl(id), signal ? { signal } : {});

export const saveAnswers = (id: string, answers: AnswerInput[]): Promise<Attempt> => apiFetch<Attempt>(`${attemptUrl(id)}/answers`, json('PUT', { answers }));

export const submitAttempt = (id: string, answers: AnswerInput[]): Promise<Attempt> => apiFetch<Attempt>(`${attemptUrl(id)}/submit`, json('POST', { answers }));

export const reviewAnswer = (attemptId: string, questionId: string): Promise<QuizResult> =>
  apiFetch<QuizResult>(`${attemptUrl(attemptId)}/answers/${encodeURIComponent(questionId)}/review`, { method: 'POST' });
