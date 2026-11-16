import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/authContext';
import { describeAuthError, type FieldErrors } from '../auth/authForm';
import { useAsyncAction } from '../auth/useAsyncAction';
import { aiBlockerFor, noticeForError } from '../chat/availability';
import { useAiConfigured } from '../chat/hooks';
import type { AiNotice } from '../chat/useChatSend';
import { AiDisclosureGate } from '../components/AiDisclosureGate';
import { QuizConfigForm } from '../components/QuizConfigForm';
import { QuizList } from '../components/QuizList';
import { MESSAGES, QUIZ_MESSAGES } from '../constants';
import { useMaterials } from '../materials/hooks';
import { useCreateQuiz, useQuizzes } from '../quizzes/hooks';
import { toQuizRequest, type QuizFormValues } from '../quizzes/quizForm';

const FORM_FIELDS = ['topic', 'materialId', 'count', 'types'] as const;

export function QuizzesPage() {
  const navigate = useNavigate();
  const { state } = useAuth();
  const emailVerified = state.status === 'authenticated' && state.user.emailVerified;
  const aiConfigured = useAiConfigured().data;
  const materials = useMaterials();
  const quizzes = useQuizzes();
  const create = useCreateQuiz();
  const action = useAsyncAction();

  const [notice, setNotice] = useState<AiNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const lastValues = useRef<QuizFormValues | null>(null);

  const blocker = aiBlockerFor(QUIZ_MESSAGES, { aiConfigured, emailVerified, notice });
  const readyMaterials = (materials.data?.items ?? []).filter((material) => material.status === 'ready');

  const generate = async (values: QuizFormValues) => {
    lastValues.current = values;
    setError(null);
    setServerErrors({});
    const result = await action.run(() => create.mutateAsync(toQuizRequest(values)));
    if (!result) return;
    if (result.ok) {
      navigate(`/quiz/${result.value.id}`);
      return;
    }
    if (result.error instanceof ApiError) setNotice(noticeForError(result.error));
    const described = describeAuthError(result.error, { fields: FORM_FIELDS });
    setServerErrors(described.fields ?? {});
    setError(described.form ?? (described.fields ? null : MESSAGES.generic));
  };

  return (
    <>
      <section className="card" aria-labelledby="page-heading">
        <h1 id="page-heading">Quiz</h1>
        <p>Test yourself with a quiz on a topic or on one of your materials. Scoring is done by the server, never by the AI.</p>
        <AiDisclosureGate>
          <QuizConfigForm
            materials={readyMaterials}
            materialsLoading={materials.isPending}
            blocker={blocker}
            pending={action.pending}
            error={error}
            serverErrors={serverErrors}
            onSubmit={(values) => void generate(values)}
            onRetry={() => lastValues.current && void generate(lastValues.current)}
          />
        </AiDisclosureGate>
      </section>

      <section className="card" aria-labelledby="quizzes-heading" aria-busy={quizzes.isFetching}>
        <h2 id="quizzes-heading">Your quizzes</h2>
        {quizzes.isPending && <p role="status">Loading quizzes…</p>}
        {quizzes.isError && (
          <div role="alert" className="notice">
            <p>{describeAuthError(quizzes.error).form ?? QUIZ_MESSAGES.loadFailed}</p>
            <button type="button" className="button" onClick={() => void quizzes.refetch()}>
              Retry
            </button>
          </div>
        )}
        {quizzes.data && <QuizList items={quizzes.data.items} />}
      </section>
    </>
  );
}
