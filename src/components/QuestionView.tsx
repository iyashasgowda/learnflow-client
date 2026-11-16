import type { AnswerValue, QuizQuestion } from '../api/quizzes';
import { QUIZ_LIMITS } from '../constants';

interface Props {
  question: QuizQuestion;
  number: number;
  value: AnswerValue | null | undefined;
  onChange: (value: AnswerValue) => void;
  // Called when the learner leaves a text answer, so it can be saved.
  onCommit: () => void;
  disabled: boolean;
}

function Choice({ name, label, checked, disabled, onSelect }: { name: string; label: string; checked: boolean; disabled: boolean; onSelect: () => void }) {
  return (
    <label className="quiz-option">
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onSelect} /> {label}
    </label>
  );
}

// One question with the input that suits its type; it never shows or knows the answer.
export function QuestionView({ question, number, value, onChange, onCommit, disabled }: Props) {
  const heading = `${number}. ${question.statement}`;
  const name = `question-${question.id}`;

  if (question.type === 'short_answer') {
    const id = `${name}-answer`;
    return (
      <div className="form-field quiz-question">
        <label htmlFor={id}>{heading}</label>
        <input
          id={id}
          type="text"
          autoComplete="off"
          maxLength={QUIZ_LIMITS.answerMax}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onCommit}
        />
      </div>
    );
  }

  const options =
    question.type === 'true_false'
      ? [
          { label: 'True', selected: value === true, answer: true as AnswerValue },
          { label: 'False', selected: value === false, answer: false as AnswerValue },
        ]
      : (question.options ?? []).map((label, index) => ({ label, selected: value === index, answer: index as AnswerValue }));

  return (
    <fieldset className="quiz-fieldset quiz-question">
      <legend>{heading}</legend>
      <div className="quiz-choices quiz-choices-stacked">
        {options.map((option) => (
          <Choice key={option.label} name={name} label={option.label} checked={option.selected} disabled={disabled} onSelect={() => onChange(option.answer)} />
        ))}
      </div>
    </fieldset>
  );
}
