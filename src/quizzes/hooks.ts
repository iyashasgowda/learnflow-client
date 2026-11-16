import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createQuiz, getAttempt, getQuiz, listAttempts, listQuizzes, reviewAnswer, saveAnswers, startAttempt, submitAttempt } from '../api/quizzes';
import type { AnswerInput, Attempt, QuizResult } from '../api/quizzes';

const QUIZZES_KEY = ['quizzes'] as const;
const quizKey = (id: string) => ['quiz', id] as const;
const attemptsKey = (quizId: string) => ['attempts', quizId] as const;
const attemptKey = (id: string) => ['attempt', id] as const;

export const useQuizzes = () => useQuery({ queryKey: QUIZZES_KEY, queryFn: ({ signal }) => listQuizzes(signal) });

export const useQuiz = (id: string) => useQuery({ queryKey: quizKey(id), queryFn: ({ signal }) => getQuiz(id, signal) });

export const useAttempts = (quizId: string) => useQuery({ queryKey: attemptsKey(quizId), queryFn: ({ signal }) => listAttempts(quizId, signal) });

export const useAttempt = (id: string | null) =>
  useQuery({ queryKey: attemptKey(id ?? ''), queryFn: ({ signal }) => getAttempt(id as string, signal), enabled: id !== null });

export function useCreateQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createQuiz,
    onSuccess: (quiz) => {
      queryClient.setQueryData(quizKey(quiz.id), quiz);
      void queryClient.invalidateQueries({ queryKey: QUIZZES_KEY });
    },
  });
}

export function useStartAttempt(quizId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => startAttempt(quizId),
    onSuccess: (attempt) => {
      queryClient.setQueryData(attemptKey(attempt.id), attempt);
      void queryClient.invalidateQueries({ queryKey: attemptsKey(quizId) });
      void queryClient.invalidateQueries({ queryKey: QUIZZES_KEY });
    },
  });
}

// Drafts: the server keeps them, so progress survives a reload or another device.
export function useSaveAnswers(attemptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (answers: AnswerInput[]) => saveAnswers(attemptId, answers),
    onSuccess: (attempt) => queryClient.setQueryData(attemptKey(attemptId), attempt),
  });
}

export function useSubmitAttempt(attemptId: string, quizId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (answers: AnswerInput[]) => submitAttempt(attemptId, answers),
    onSuccess: (attempt) => {
      queryClient.setQueryData(attemptKey(attemptId), attempt);
      void queryClient.invalidateQueries({ queryKey: attemptsKey(quizId) });
      void queryClient.invalidateQueries({ queryKey: QUIZZES_KEY });
    },
  });
}

// Puts the reviewed question back into the cached attempt so the score and the other results are untouched.
export function useReviewAnswer(attemptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (questionId: string) => reviewAnswer(attemptId, questionId),
    onSuccess: (result: QuizResult) =>
      queryClient.setQueryData<Attempt>(attemptKey(attemptId), (attempt) =>
        attempt?.results ? { ...attempt, results: attempt.results.map((item) => (item.questionId === result.questionId ? result : item)) } : attempt,
      ),
  });
}

export function useRefreshAttempt(attemptId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: attemptKey(attemptId) });
}
