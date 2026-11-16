import { useRef, useState } from 'react';
import { ApiError } from '../api/client';
import type { AnswerInput, AnswerValue, Attempt, Quiz } from '../api/quizzes';
import { describeAuthError } from '../auth/authForm';
import { ERROR_CODES, MESSAGES, QUIZ_MESSAGES } from '../constants';
import { isAnswered } from '../quizzes/answers';
import { useRefreshAttempt, useSaveAnswers, useSubmitAttempt } from '../quizzes/hooks';
import { ConfirmDialog } from './ConfirmDialog';
import { QuestionView } from './QuestionView';

type Answers = Record<string, AnswerValue | null>;

export function QuizTaker({ quiz, attempt }: { quiz: Quiz; attempt: Attempt }) {
  const [answers, setAnswers] = useState<Answers>(() => Object.fromEntries(attempt.answers.map((item) => [item.questionId, item.answer])));
  const [index, setIndex] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Text answers changed since the last save; choices are saved the moment they are picked.
  const dirty = useRef(new Set<string>());

  const save = useSaveAnswers(attempt.id);
  const submit = useSubmitAttempt(attempt.id, quiz.id);
  const refresh = useRefreshAttempt(attempt.id);

  const total = quiz.questions.length;
  const question = quiz.questions[index];
  const answered = quiz.questions.filter((item) => isAnswered(answers[item.id])).length;
  const unanswered = total - answered;
  const locked = submit.isPending;

  const toInputs = (source: Answers, ids: string[]): AnswerInput[] => ids.map((id) => ({ questionId: id, answer: source[id] ?? null }));

  // Failing to save never loses the answer: it stays here and is sent again with the next save or the submission.
  const persist = async (source: Answers, ids: string[]) => {
    if (ids.length === 0) return;
    // Claimed before the request, so leaving a field and then navigating does not send the same save twice.
    ids.forEach((id) => dirty.current.delete(id));
    try {
      await save.mutateAsync(toInputs(source, ids));
      setSaveFailed(false);
    } catch {
      ids.forEach((id) => dirty.current.add(id));
      setSaveFailed(true);
    }
  };

  const change = (id: string, value: AnswerValue, immediate: boolean) => {
    const next = { ...answers, [id]: value };
    setAnswers(next);
    dirty.current.add(id);
    if (immediate) void persist(next, [...dirty.current]);
  };

  const flush = () => persist(answers, [...dirty.current]);

  const goTo = (target: number) => {
    void flush();
    setIndex(Math.min(Math.max(target, 0), total - 1));
  };

  const doSubmit = async () => {
    setSubmitError(null);
    setConfirming(false);
    try {
      await submit.mutateAsync(toInputs(answers, quiz.questions.map((item) => item.id)).filter((item) => item.answer !== null));
    } catch (error) {
      if (error instanceof ApiError && error.code === ERROR_CODES.ATTEMPT_LOCKED) {
        // It was already submitted elsewhere; show how it was scored.
        await refresh();
        return;
      }
      setSubmitError(describeAuthError(error).form ?? MESSAGES.generic);
    }
  };

  const requestSubmit = () => {
    if (unanswered > 0) setConfirming(true);
    else void doSubmit();
  };

  if (!question) return null;

  return (
    <section className="card" aria-label="Take the quiz" aria-busy={locked}>
      <p className="quiz-progress-text" id="quiz-progress-label">
        Question {index + 1} of {total} · {answered} answered
      </p>
      <progress aria-labelledby="quiz-progress-label" value={answered} max={total} />

      <nav aria-label="Questions">
        <ol className="quiz-nav">
          {quiz.questions.map((item, position) => (
            <li key={item.id}>
              <button
                type="button"
                className={`chip${isAnswered(answers[item.id]) ? ' quiz-nav-answered' : ''}`}
                aria-current={position === index ? 'step' : undefined}
                aria-label={`Question ${position + 1}${isAnswered(answers[item.id]) ? ', answered' : ''}`}
                disabled={locked}
                onClick={() => goTo(position)}
              >
                {position + 1}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <QuestionView
        key={question.id}
        question={question}
        number={index + 1}
        value={answers[question.id]}
        disabled={locked}
        onChange={(value) => change(question.id, value, question.type !== 'short_answer')}
        onCommit={() => void flush()}
      />

      {saveFailed && (
        <p role="alert" className="field-error">
          {QUIZ_MESSAGES.saveFailed}
        </p>
      )}
      {submitError && (
        <div role="alert" className="notice">
          <p>{submitError}</p>
          <button type="button" className="button" onClick={requestSubmit}>
            Try again
          </button>
        </div>
      )}

      <div className="button-row">
        <button type="button" className="button button-quiet" disabled={locked || index === 0} onClick={() => goTo(index - 1)}>
          Previous
        </button>
        <button type="button" className="button button-quiet" disabled={locked || index === total - 1} onClick={() => goTo(index + 1)}>
          Next
        </button>
        <button type="button" className="button" disabled={locked} onClick={requestSubmit}>
          {locked ? 'Submitting…' : 'Submit quiz'}
        </button>
      </div>

      {confirming && (
        <ConfirmDialog title="Submit with unanswered questions?" confirmLabel="Submit anyway" pendingLabel="Submitting…" pending={false} onConfirm={() => void doSubmit()} onCancel={() => setConfirming(false)}>
          <p>
            {unanswered} {unanswered === 1 ? 'question is' : 'questions are'} unanswered and will be marked incorrect. Answers cannot be changed after you submit.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
