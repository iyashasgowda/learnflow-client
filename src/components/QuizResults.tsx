import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import type { Attempt, QuizResult } from '../api/quizzes';
import { useAuth } from '../auth/authContext';
import { describeAuthError } from '../auth/authForm';
import { aiBlockerFor, noticeForError } from '../chat/availability';
import { useAiConfigured } from '../chat/hooks';
import type { AiNotice } from '../chat/useChatSend';
import { MESSAGES, QUIZ_MESSAGES } from '../constants';
import { answerText, correctText, isAnswered, UNANSWERED } from '../quizzes/answers';
import { useReviewAnswer } from '../quizzes/hooks';
import { AiDisclosureGate } from './AiDisclosureGate';

interface Props {
  attempt: Attempt;
  onRetake: () => void;
  retaking: boolean;
  retakeError: string | null;
}

const verdictText = (verdict: 'acceptable' | 'not_acceptable'): string =>
  verdict === 'acceptable' ? 'The AI considers your answer acceptable.' : 'The AI does not consider your answer acceptable.';

function resultLabel(result: QuizResult): string {
  if (result.correct) return 'Correct';
  return isAnswered(result.answer) ? 'Incorrect' : UNANSWERED;
}

export function QuizResults({ attempt, onRetake, retaking, retakeError }: Props) {
  const { state } = useAuth();
  const emailVerified = state.status === 'authenticated' && state.user.emailVerified;
  const aiConfigured = useAiConfigured().data;
  const review = useReviewAnswer(attempt.id);
  const [notice, setNotice] = useState<AiNotice | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [failures, setFailures] = useState<Record<string, string>>({});

  const blocker = aiBlockerFor(QUIZ_MESSAGES, { aiConfigured, emailVerified, notice });

  const ask = async (questionId: string) => {
    setReviewing(questionId);
    setFailures((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== questionId)));
    try {
      await review.mutateAsync(questionId);
    } catch (error) {
      if (error instanceof ApiError) setNotice(noticeForError(error));
      setFailures((current) => ({ ...current, [questionId]: describeAuthError(error).form ?? MESSAGES.generic }));
    } finally {
      setReviewing(null);
    }
  };

  const results = attempt.results ?? [];

  return (
    <section className="card" aria-label="Quiz results">
      <h2>
        You scored {attempt.score} of {attempt.total}
        <span className="text-muted"> ({attempt.percent}%)</span>
      </h2>

      <ol className="result-list">
        {results.map((result, position) => (
          <li key={result.questionId} className="result">
            <p className="result-statement">
              {position + 1}. {result.statement}
            </p>
            <p className="task-meta">
              <span className={`badge ${result.correct ? 'badge-ready' : 'badge-failed'}`}>{resultLabel(result)}</span>
            </p>
            <dl className="result-answers">
              <dt>Your answer</dt>
              <dd>{answerText(result)}</dd>
              <dt>Correct answer</dt>
              <dd>{correctText(result)}</dd>
            </dl>
            <p className="text-muted">{result.explanation}</p>

            {result.aiReview && (
              <div className="notice">
                <p>
                  <strong>AI-judged review.</strong> {verdictText(result.aiReview.verdict)} {result.aiReview.feedback}
                </p>
                <p className="text-muted">{QUIZ_MESSAGES.reviewLabel}</p>
              </div>
            )}

            {result.type === 'short_answer' && !result.correct && isAnswered(result.answer) && !result.aiReview && (
              <>
                <AiDisclosureGate>
                  <button type="button" className="button button-quiet" disabled={blocker !== null || reviewing !== null} onClick={() => void ask(result.questionId)}>
                    {reviewing === result.questionId ? 'Asking the AI…' : 'Ask AI to review'}
                  </button>
                </AiDisclosureGate>
                {blocker && <p className="field-hint">Review unavailable. {blocker.message}</p>}
                {failures[result.questionId] && (
                  <p role="alert" className="field-error">
                    {failures[result.questionId]}
                  </p>
                )}
              </>
            )}
          </li>
        ))}
      </ol>

      {retakeError && (
        <p role="alert" className="form-error">
          {retakeError}
        </p>
      )}
      <div className="button-row">
        <button type="button" className="button" disabled={retaking} onClick={onRetake}>
          {retaking ? 'Starting…' : 'Retake this quiz'}
        </button>
        <Link className="button button-quiet" to="/quiz">
          New quiz
        </Link>
      </div>
    </section>
  );
}
