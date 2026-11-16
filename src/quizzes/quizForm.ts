import type { FieldErrors } from '../auth/authForm';
import type { CreateQuizRequest, Quiz } from '../api/quizzes';
import { QUIZ_DIFFICULTIES, QUIZ_LIMITS, QUIZ_TYPES } from '../constants';

type Difficulty = Quiz['difficulty'];
type QuestionType = Quiz['types'][number];

export interface QuizFormValues {
  source: 'topic' | 'material';
  topic: string;
  materialId: string;
  difficulty: Difficulty;
  // Kept as typed so the field can show exactly what the user entered.
  count: string;
  types: QuestionType[];
}

export const defaultQuizForm = (): QuizFormValues => ({
  source: 'topic',
  topic: '',
  materialId: '',
  difficulty: QUIZ_DIFFICULTIES[1].value,
  count: String(QUIZ_LIMITS.countDefault),
  types: QUIZ_TYPES.map((type) => type.value),
});

const parseCount = (text: string): number => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN);

export function validateQuizForm(values: QuizFormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (values.source === 'topic') {
    const topic = values.topic.trim();
    if (!topic) errors.topic = 'Enter a topic.';
    else if (topic.length > QUIZ_LIMITS.topicMax) errors.topic = `Use at most ${QUIZ_LIMITS.topicMax} characters.`;
  } else if (!values.materialId) {
    errors.materialId = 'Choose a material.';
  }
  const count = parseCount(values.count);
  if (!(count >= QUIZ_LIMITS.countMin && count <= QUIZ_LIMITS.countMax)) {
    errors.count = `Enter a whole number from ${QUIZ_LIMITS.countMin} to ${QUIZ_LIMITS.countMax}.`;
  }
  if (values.types.length === 0) errors.types = 'Choose at least one question type.';
  return errors;
}

export function toQuizRequest(values: QuizFormValues): CreateQuizRequest {
  return {
    ...(values.source === 'topic' ? { topic: values.topic.trim() } : { materialId: values.materialId }),
    difficulty: values.difficulty,
    count: parseCount(values.count),
    types: QUIZ_TYPES.map((type) => type.value).filter((type) => values.types.includes(type)),
  };
}
