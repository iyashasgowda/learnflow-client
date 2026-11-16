import { useState } from 'react';
import type { FieldErrors } from '../auth/authForm';
import type { Material } from '../api/materials';
import type { Blocker } from '../chat/availability';
import { QUIZ_DIFFICULTIES, QUIZ_LIMITS, QUIZ_MESSAGES, QUIZ_TYPES } from '../constants';
import { useFormatters } from '../settings/useFormatters';
import { defaultQuizForm, validateQuizForm, type QuizFormValues } from '../quizzes/quizForm';
import { FormField } from './FormField';

interface Props {
  // Only materials that are ready; a quiz cannot be made from the others.
  materials: Material[];
  materialsLoading: boolean;
  blocker: Blocker | null;
  pending: boolean;
  // Why the last attempt failed, with a way to try the same request again.
  error: string | null;
  serverErrors: FieldErrors;
  onSubmit: (values: QuizFormValues) => void;
  onRetry: () => void;
}

export function QuizConfigForm({ materials, materialsLoading, blocker, pending, error, serverErrors, onSubmit, onRetry }: Props) {
  const { time } = useFormatters();
  const [values, setValues] = useState<QuizFormValues>(defaultQuizForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const shown: FieldErrors = { ...serverErrors, ...errors };
  const set = <K extends keyof QuizFormValues>(key: K, value: QuizFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  const toggleType = (type: QuizFormValues['types'][number]) =>
    set('types', values.types.includes(type) ? values.types.filter((item) => item !== type) : [...values.types, type]);

  const submit = () => {
    const found = validateQuizForm(values);
    setErrors(found);
    if (Object.keys(found).length === 0) onSubmit(values);
  };

  return (
    <form
      noValidate
      className="quiz-form"
      aria-label="Make a quiz"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <fieldset className="quiz-fieldset">
        <legend>Source</legend>
        <div className="quiz-choices">
          <label>
            <input type="radio" name="quiz-source" checked={values.source === 'topic'} onChange={() => set('source', 'topic')} /> A topic
          </label>
          <label>
            <input type="radio" name="quiz-source" checked={values.source === 'material'} onChange={() => set('source', 'material')} /> One of my materials
          </label>
        </div>
      </fieldset>

      {values.source === 'topic' ? (
        <FormField id="quiz-topic" label="Topic" type="text" autoComplete="off" value={values.topic} onChange={(value) => set('topic', value)} error={shown.topic} hint={`For example, photosynthesis. Up to ${QUIZ_LIMITS.topicMax} characters.`} />
      ) : (
        <div className="form-field">
          <label htmlFor="quiz-material">Material</label>
          <select
            id="quiz-material"
            value={values.materialId}
            aria-invalid={shown.materialId ? true : undefined}
            aria-describedby={shown.materialId ? 'quiz-material-error' : undefined}
            onChange={(event) => set('materialId', event.target.value)}
          >
            <option value="">Choose a material</option>
            {materials.map((material) => (
              <option key={material.id} value={material.id}>
                {material.name}
              </option>
            ))}
          </select>
          {!materialsLoading && materials.length === 0 && <p className="field-hint">{QUIZ_MESSAGES.noMaterials}</p>}
          {shown.materialId && (
            <p id="quiz-material-error" className="field-error">
              {shown.materialId}
            </p>
          )}
        </div>
      )}

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="quiz-difficulty">Difficulty</label>
          <select id="quiz-difficulty" value={values.difficulty} onChange={(event) => set('difficulty', event.target.value as QuizFormValues['difficulty'])}>
            {QUIZ_DIFFICULTIES.map((difficulty) => (
              <option key={difficulty.value} value={difficulty.value}>
                {difficulty.label}
              </option>
            ))}
          </select>
        </div>
        <FormField id="quiz-count" label="Number of questions" type="number" autoComplete="off" value={values.count} onChange={(value) => set('count', value)} error={shown.count} />
      </div>

      <fieldset className="quiz-fieldset" aria-describedby={shown.types ? 'quiz-types-error' : undefined}>
        <legend>Question types</legend>
        <div className="quiz-choices">
          {QUIZ_TYPES.map((type) => (
            <label key={type.value}>
              <input type="checkbox" checked={values.types.includes(type.value)} onChange={() => toggleType(type.value)} /> {type.label}
            </label>
          ))}
        </div>
        {shown.types && (
          <p id="quiz-types-error" className="field-error">
            {shown.types}
          </p>
        )}
      </fieldset>

      {blocker && (
        <p className="notice" role="status">
          {blocker.message}
          {blocker.resetsAt !== null && ` They reset at ${time(blocker.resetsAt)}.`}
        </p>
      )}
      {pending && (
        <div role="status">
          <p className="text-muted">{QUIZ_MESSAGES.generating}</p>
          <progress aria-label="Generating your quiz" />
        </div>
      )}
      {error && !pending && (
        <div role="alert" className="notice">
          <p>{error}</p>
          {!blocker && (
            <button type="button" className="button" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      )}

      <button type="submit" className="button" disabled={pending || blocker !== null}>
        {pending ? 'Generating…' : 'Generate quiz'}
      </button>
    </form>
  );
}
