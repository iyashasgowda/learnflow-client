import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { describeAuthError } from '../auth/authForm';
import { AttemptHistory } from '../components/AttemptHistory';
import { QuizResults } from '../components/QuizResults';
import { QuizTaker } from '../components/QuizTaker';
import { HTTP_NOT_FOUND, MESSAGES, QUIZ_DIFFICULTIES, QUIZ_MESSAGES, QUIZ_TYPES } from '../constants';
import { useAttempt, useAttempts, useQuiz, useStartAttempt } from '../quizzes/hooks';

const label = <T extends string>(options: ReadonlyArray<{ value: T; label: string }>, value: T): string => options.find((item) => item.value === value)?.label ?? value;

export function QuizPage() {
  const { quizId = '' } = useParams();
  const quiz = useQuiz(quizId);
  const attempts = useAttempts(quizId);
  const start = useStartAttempt(quizId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const items = attempts.data?.items;
  // The unsubmitted attempt wins, so a reload resumes it; otherwise the latest result is shown.
  const activeId = selectedId ?? items?.find((item) => item.status === 'in_progress')?.id ?? items?.[0]?.id ?? null;
  const attempt = useAttempt(activeId);

  const begin = async () => {
    setStartError(null);
    try {
      setSelectedId((await start.mutateAsync()).id);
    } catch (error) {
      setStartError(describeAuthError(error).form ?? MESSAGES.generic);
    }
  };

  if (quiz.isPending) return <p role="status">Loading quiz…</p>;
  if (quiz.isError) {
    const missing = quiz.error instanceof ApiError && quiz.error.status === HTTP_NOT_FOUND;
    return (
      <section className="card">
        <h1>Quiz</h1>
        <p role="alert">{missing ? 'This quiz was not found.' : (describeAuthError(quiz.error).form ?? QUIZ_MESSAGES.loadFailed)}</p>
        <div className="button-row">
          {!missing && (
            <button type="button" className="button" onClick={() => void quiz.refetch()}>
              Retry
            </button>
          )}
          <Link className="button button-quiet" to="/quiz">
            All quizzes
          </Link>
        </div>
      </section>
    );
  }

  const { data } = quiz;

  return (
    <>
      <section className="card" aria-labelledby="page-heading">
        <h1 id="page-heading">{data.title}</h1>
        <p className="task-meta">
          <span>{label(QUIZ_DIFFICULTIES, data.difficulty)}</span>
          <span>{data.questionCount} questions</span>
          <span>{data.types.map((type) => label(QUIZ_TYPES, type)).join(', ')}</span>
        </p>
        {data.sourcePartial && (
          <p className="text-muted">
            This material is long, so the questions come from its first {data.sourceChars?.toLocaleString()} characters{data.materialName ? ` (${data.materialName})` : ''}.
          </p>
        )}
        <Link className="button button-quiet" to="/quiz">
          All quizzes
        </Link>
      </section>

      {attempts.isPending && <p role="status">Loading attempts…</p>}
      {attempts.isError && (
        <div role="alert" className="notice">
          <p>{describeAuthError(attempts.error).form ?? QUIZ_MESSAGES.loadFailed}</p>
          <button type="button" className="button" onClick={() => void attempts.refetch()}>
            Retry
          </button>
        </div>
      )}

      {items?.length === 0 && (
        <section className="card" aria-label="Start the quiz">
          <p>You have not taken this quiz yet.</p>
          {startError && (
            <p role="alert" className="form-error">
              {startError}
            </p>
          )}
          <button type="button" className="button" disabled={start.isPending} onClick={() => void begin()}>
            {start.isPending ? 'Starting…' : 'Start quiz'}
          </button>
        </section>
      )}

      {activeId && attempt.isPending && <p role="status">Loading attempt…</p>}
      {attempt.isError && (
        <div role="alert" className="notice">
          <p>{describeAuthError(attempt.error).form ?? QUIZ_MESSAGES.loadFailed}</p>
          <button type="button" className="button" onClick={() => void attempt.refetch()}>
            Retry
          </button>
        </div>
      )}
      {attempt.data?.status === 'in_progress' && <QuizTaker key={attempt.data.id} quiz={data} attempt={attempt.data} />}
      {attempt.data?.status === 'submitted' && <QuizResults key={attempt.data.id} attempt={attempt.data} onRetake={() => void begin()} retaking={start.isPending} retakeError={startError} />}

      {items && <AttemptHistory items={items} activeId={activeId} onSelect={setSelectedId} />}
    </>
  );
}
