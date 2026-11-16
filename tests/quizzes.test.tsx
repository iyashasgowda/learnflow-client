import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeMaterial, materialList } from './fakeXhr';
import { errorResponse, jsonResponse, renderSignedIn, SETTINGS, stubApi, USER } from './testUtils';
import { formatTime } from '../src/time/zone';
import type { RecordedRequest, RouteHandler } from './testUtils';

const user = userEvent.setup();

const QUIZ = {
  id: 'q-1',
  title: 'Capitals',
  source: 'topic',
  topic: 'Capitals',
  materialId: null,
  materialName: null,
  difficulty: 'medium',
  questionCount: 3,
  types: ['multiple_choice', 'true_false', 'short_answer'],
  model: 'gpt-test',
  sourceChars: null,
  sourcePartial: false,
  createdAt: '2030-06-15T12:00:00.000Z',
  questions: [
    { id: 'k1', type: 'multiple_choice', statement: 'Which city is the capital?', options: ['Lyon', 'Paris', 'Nice'] },
    { id: 'k2', type: 'true_false', statement: 'Paris is in France.' },
    { id: 'k3', type: 'short_answer', statement: 'Name the capital of France.' },
  ],
};

const QUIZ_BASE = Object.fromEntries(Object.entries(QUIZ).filter(([key]) => key !== 'questions'));
const summaryOf = (attemptCount: number) => ({ ...QUIZ_BASE, attemptCount });

type Answer = number | boolean | string;
interface AttemptState {
  id: string;
  status: 'in_progress' | 'submitted';
  startedAt: string;
  answers: Record<string, Answer>;
  score: number | null;
  results: unknown[] | null;
  reviews: Record<string, unknown>;
}

const KEY: Record<string, { correct: Answer | string[]; explanation: string }> = {
  k1: { correct: 1, explanation: 'Paris is the capital of France.' },
  k2: { correct: true, explanation: 'Paris is a French city.' },
  k3: { correct: ['Paris'], explanation: 'The capital is Paris.' },
};

const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
const isRight = (id: string, answer: Answer | undefined): boolean => {
  if (answer === undefined) return false;
  if (id === 'k3') return typeof answer === 'string' && normalize(answer) === 'paris';
  return answer === KEY[id]?.correct;
};

// A small stand-in for the quiz API that keeps attempts the way the server does.
function quizServer(options: { attempts?: Array<Partial<AttemptState>>; configured?: boolean; verified?: boolean; onSubmit?: RouteHandler; onSave?: RouteHandler; onReview?: RouteHandler; onStart?: RouteHandler; extra?: Record<string, RouteHandler> } = {}) {
  const attempts: AttemptState[] = (options.attempts ?? []).map((partial, index) => ({
    id: `a-${index + 1}`,
    status: 'in_progress',
    startedAt: `2030-06-15T12:0${index}:00.000Z`,
    answers: {},
    score: null,
    results: null,
    reviews: {},
    ...partial,
  }));
  let next = attempts.length + 1;

  const dto = (attempt: AttemptState) => ({
    id: attempt.id,
    quizId: 'q-1',
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.status === 'submitted' ? '2030-06-15T13:00:00.000Z' : null,
    score: attempt.score,
    total: 3,
    percent: attempt.score === null ? null : Math.round((attempt.score / 3) * 100),
    answers: Object.entries(attempt.answers).map(([questionId, answer]) => ({ questionId, answer })),
    results: attempt.status === 'submitted' ? QUIZ.questions.map((question) => resultOf(attempt, question.id)) : null,
  });
  const resultOf = (attempt: AttemptState, id: string) => {
    const question = QUIZ.questions.find((item) => item.id === id) as (typeof QUIZ.questions)[number];
    const answer = attempt.answers[id];
    return {
      questionId: id,
      type: question.type,
      statement: question.statement,
      ...('options' in question ? { options: question.options } : {}),
      answer: answer ?? null,
      correct: isRight(id, answer),
      correctAnswer: KEY[id]?.correct,
      explanation: KEY[id]?.explanation,
      aiReview: attempt.reviews[id] ?? null,
    };
  };
  const find = (id: string) => attempts.find((item) => item.id === id) as AttemptState;
  const summaries = () => attempts.map((attempt) => ({ ...dto(attempt), answers: undefined, results: undefined }));

  const routes: Record<string, RouteHandler> = {
    'GET /api/health': () => jsonResponse({ status: 'ok', ai: { configured: options.configured ?? true } }),
    'GET /api/auth/me': () => jsonResponse({ user: { ...USER, emailVerified: options.verified ?? true } }),
    'GET /api/materials': () => jsonResponse(materialList([makeMaterial({ id: 'm-1', name: 'biology.txt' }), makeMaterial({ id: 'm-2', name: 'broken.pdf', status: 'failed', failureReason: 'Cannot read.' })])),
    'GET /api/quizzes': () => jsonResponse({ items: [summaryOf(attempts.length)] }),
    'GET /api/quizzes/q-1': () => jsonResponse(QUIZ),
    'GET /api/quizzes/q-1/attempts': () => jsonResponse({ items: [...summaries()].reverse() }),
    'POST /api/quizzes/q-1/attempts': (request) => {
      if (options.onStart) return options.onStart(request);
      const open = attempts.find((attempt) => attempt.status === 'in_progress');
      if (open) return jsonResponse(dto(open));
      const created: AttemptState = { id: `a-${next}`, status: 'in_progress', startedAt: `2030-06-15T12:${String(10 + next).padStart(2, '0')}:00.000Z`, answers: {}, score: null, results: null, reviews: {} };
      next += 1;
      attempts.push(created);
      return jsonResponse(dto(created), 201);
    },
    ...options.extra,
  };

  for (const id of ['a-1', 'a-2', 'a-3']) {
    routes[`GET /api/attempts/${id}`] = () => jsonResponse(dto(find(id)));
    routes[`PUT /api/attempts/${id}/answers`] = (request) => {
      if (options.onSave) return options.onSave(request);
      for (const item of (request.body as { answers: Array<{ questionId: string; answer: Answer | null }> }).answers) {
        if (item.answer === null) delete find(id).answers[item.questionId];
        else find(id).answers[item.questionId] = item.answer;
      }
      return jsonResponse(dto(find(id)));
    };
    routes[`POST /api/attempts/${id}/submit`] = (request) => {
      if (options.onSubmit) return options.onSubmit(request);
      const attempt = find(id);
      for (const item of (request.body as { answers?: Array<{ questionId: string; answer: Answer }> }).answers ?? []) attempt.answers[item.questionId] = item.answer;
      attempt.status = 'submitted';
      attempt.score = QUIZ.questions.filter((question) => isRight(question.id, attempt.answers[question.id])).length;
      return jsonResponse(dto(attempt));
    };
    routes[`POST /api/attempts/${id}/answers/k3/review`] = (request) => {
      if (options.onReview) return options.onReview(request);
      find(id).reviews.k3 = { verdict: 'acceptable', feedback: 'That means the same thing.' };
      return jsonResponse(resultOf(find(id), 'k3'));
    };
  }
  return { routes, attempts };
}

const open = async (path: string, options: Parameters<typeof quizServer>[0] = {}) => {
  const server = quizServer(options);
  const api = stubApi(server.routes);
  await renderSignedIn(path);
  return { ...server, api };
};

const topicField = () => screen.getByLabelText('Topic');
const countField = () => screen.getByLabelText('Number of questions');
const generate = () => screen.getByRole('button', { name: /^generat/i });
const requestsTo = (api: ReturnType<typeof stubApi>, key: string): RecordedRequest[] => api.callsTo(key);

describe('quiz page: configuring a quiz', () => {
  it('shows the form with sensible defaults and the list of past quizzes', async () => {
    await open('/quiz');
    expect(await screen.findByRole('heading', { level: 1, name: 'Quiz' })).toBeInTheDocument();
    expect(countField()).toHaveValue(5);
    for (const type of ['Multiple choice', 'True / false', 'Short answer']) expect(screen.getByRole('checkbox', { name: type })).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Difficulty' })).toHaveValue('medium');
    const list = await screen.findByRole('list', { name: 'Your quizzes' });
    expect(within(list).getByText('Capitals')).toBeInTheDocument();
    expect(within(list).getByText('0 attempts')).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Open: Capitals' })).toHaveAttribute('href', '/quiz/q-1');
  });

  it('says there are no quizzes yet', async () => {
    const server = quizServer();
    stubApi({ ...server.routes, 'GET /api/quizzes': () => jsonResponse({ items: [] }) });
    await renderSignedIn('/quiz');
    expect(await screen.findByText(/You have no quizzes yet/)).toBeInTheDocument();
  });

  it('shows an error with a retry when the list cannot be loaded', async () => {
    let fail = true;
    const server = quizServer();
    stubApi({ ...server.routes, 'GET /api/quizzes': () => (fail ? errorResponse('INTERNAL', 'The list is unavailable.', 500) : jsonResponse({ items: [summaryOf(2)] })) });
    await renderSignedIn('/quiz');
    expect(await screen.findByText('The list is unavailable.')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('2 attempts')).toBeInTheDocument();
  });

  it('checks the form before asking the server', async () => {
    const { api } = await open('/quiz');
    await screen.findByRole('list', { name: 'Your quizzes' });
    await user.click(generate());
    expect(await screen.findByText('Enter a topic.')).toBeInTheDocument();

    await user.type(topicField(), 'Capitals');
    await user.clear(countField());
    await user.type(countField(), '21');
    for (const type of ['Multiple choice', 'True / false', 'Short answer']) await user.click(screen.getByRole('checkbox', { name: type }));
    await user.click(generate());
    expect(await screen.findByText('Enter a whole number from 1 to 20.')).toBeInTheDocument();
    expect(screen.getByText('Choose at least one question type.')).toBeInTheDocument();
    expect(requestsTo(api, 'POST /api/quizzes')).toHaveLength(0);
  });

  it.each(['0', '2.5', 'abc', '-3'])('rejects a count of %s', async (count) => {
    const { api } = await open('/quiz');
    await screen.findByRole('list', { name: 'Your quizzes' });
    await user.type(topicField(), 'Capitals');
    await user.clear(countField());
    if (count !== '') await user.type(countField(), count);
    await user.click(generate());
    expect(await screen.findByText('Enter a whole number from 1 to 20.')).toBeInTheDocument();
    expect(requestsTo(api, 'POST /api/quizzes')).toHaveLength(0);
  });

  it('asks for a topic of limited length', async () => {
    await open('/quiz');
    await screen.findByRole('list', { name: 'Your quizzes' });
    await user.click(screen.getByLabelText('Topic'));
    await user.paste('x'.repeat(201));
    await user.click(generate());
    expect(await screen.findByText('Use at most 200 characters.')).toBeInTheDocument();
  });

  it('generates a quiz from a topic with the chosen settings and opens it', async () => {
    let release: (response: Response) => void = () => undefined;
    const { api } = await open('/quiz', { extra: { 'POST /api/quizzes': () => new Promise<Response>((resolve) => (release = resolve)) } });
    await screen.findByRole('list', { name: 'Your quizzes' });
    await user.type(topicField(), '  Capitals  ');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Difficulty' }), 'hard');
    await user.clear(countField());
    await user.type(countField(), '3');
    await user.click(screen.getByRole('checkbox', { name: 'True / false' }));
    await user.click(generate());

    expect(await screen.findByText(/Writing your questions/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Generating your quiz' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();
    expect(requestsTo(api, 'POST /api/quizzes')[0]?.body).toEqual({ topic: 'Capitals', difficulty: 'hard', count: 3, types: ['multiple_choice', 'short_answer'] });

    release(jsonResponse(QUIZ, 201));
    expect(await screen.findByRole('heading', { level: 1, name: 'Capitals' })).toBeInTheDocument();
  });

  it('offers only ready materials and generates from the chosen one', async () => {
    const { api } = await open('/quiz', { extra: { 'POST /api/quizzes': () => jsonResponse(QUIZ, 201) } });
    await screen.findByRole('list', { name: 'Your quizzes' });
    await user.click(screen.getByRole('radio', { name: 'One of my materials' }));
    const select = screen.getByRole('combobox', { name: 'Material' });
    await waitFor(() => expect(within(select).getByRole('option', { name: 'biology.txt' })).toBeInTheDocument());
    expect(within(select).queryByRole('option', { name: 'broken.pdf' })).not.toBeInTheDocument();

    await user.click(generate());
    expect(await screen.findByText('Choose a material.')).toBeInTheDocument();
    await user.selectOptions(select, 'm-1');
    await user.click(generate());
    await screen.findByRole('heading', { level: 1, name: 'Capitals' });
    expect(requestsTo(api, 'POST /api/quizzes')[0]?.body).toEqual({ materialId: 'm-1', difficulty: 'medium', count: 5, types: ['multiple_choice', 'true_false', 'short_answer'] });
  });

  it('explains when there are no ready materials', async () => {
    const server = quizServer();
    stubApi({ ...server.routes, 'GET /api/materials': () => jsonResponse(materialList([makeMaterial({ status: 'failed' })])) });
    await renderSignedIn('/quiz');
    await user.click(await screen.findByRole('radio', { name: 'One of my materials' }));
    expect(await screen.findByText(/You have no ready materials yet/)).toBeInTheDocument();
  });

  it('shows the error with a retry, and lists no quiz, when generation fails', async () => {
    let fail = true;
    const { api } = await open('/quiz', {
      extra: { 'POST /api/quizzes': () => (fail ? errorResponse('AI_BAD_RESPONSE', 'The AI could not write enough usable questions.', 502) : jsonResponse(QUIZ, 201)) },
    });
    await screen.findByRole('list', { name: 'Your quizzes' });
    await user.type(topicField(), 'Capitals');
    await user.click(generate());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The AI could not write enough usable questions.');
    expect(screen.getByRole('heading', { level: 1, name: 'Quiz' })).toBeInTheDocument();
    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    await screen.findByRole('heading', { level: 1, name: 'Capitals' });
    expect(requestsTo(api, 'POST /api/quizzes')).toHaveLength(2);
    expect(requestsTo(api, 'POST /api/quizzes')[1]?.body).toEqual(requestsTo(api, 'POST /api/quizzes')[0]?.body);
  });

  it('shows a network failure', async () => {
    await open('/quiz', { extra: { 'POST /api/quizzes': () => Promise.reject(new TypeError('Failed to fetch')) } });
    await screen.findByRole('list', { name: 'Your quizzes' });
    await user.type(topicField(), 'Capitals');
    await user.click(generate());
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
  });

  it('puts server field errors next to their fields', async () => {
    await open('/quiz', {
      extra: { 'POST /api/quizzes': () => errorResponse('VALIDATION_ERROR', 'The request is invalid.', 400, { fields: [{ path: 'count', message: 'Ask for at most 20 questions.' }] }) },
    });
    await screen.findByRole('list', { name: 'Your quizzes' });
    await user.type(topicField(), 'Capitals');
    await user.click(generate());
    expect(await screen.findByText('Ask for at most 20 questions.')).toBeInTheDocument();
  });
});

describe('quiz page: when the AI cannot be used', () => {
  it('disables generating and says why when the server has no AI configured', async () => {
    const { api } = await open('/quiz', { configured: false });
    expect(await screen.findByText('Quiz generation is not available on this server.')).toBeInTheDocument();
    expect(generate()).toBeDisabled();
    expect(requestsTo(api, 'POST /api/quizzes')).toHaveLength(0);
  });

  it('asks the user to verify their email', async () => {
    await open('/quiz', { verified: false });
    expect(await screen.findByText(/Verify your email address to generate quizzes/)).toBeInTheDocument();
    expect(generate()).toBeDisabled();
  });

  it('shows the daily limit with its reset time after the server refuses', async () => {
    const resetsAt = new Date(Date.now() + 3_600_000);
    await open('/quiz', { extra: { 'POST /api/quizzes': () => errorResponse('AI_QUOTA_EXCEEDED', 'Daily limit reached.', 429, { resetsAt: resetsAt.toISOString() }) } });
    await screen.findByRole('list', { name: 'Your quizzes' });
    await user.type(topicField(), 'Capitals');
    await user.click(generate());
    expect(await screen.findByText(/You have used your daily AI requests/)).toHaveTextContent(formatTime(resetsAt, SETTINGS.timeZone));
    expect(generate()).toBeDisabled();
  });

  it.each([
    ['AI_NOT_CONFIGURED', 503, 'Quiz generation is not available on this server.'],
    ['AI_BUDGET_PAUSED', 503, 'AI features are paused for today.'],
  ])('learns from %s that generating is unavailable', async (code, status, message) => {
    await open('/quiz', { extra: { 'POST /api/quizzes': () => errorResponse(code, 'No.', status) } });
    await screen.findByRole('list', { name: 'Your quizzes' });
    await user.type(topicField(), 'Capitals');
    await user.click(generate());
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(generate()).toBeDisabled();
  });
});

describe('quiz page: taking a quiz', () => {
  it('starts with a Start button when there are no attempts', async () => {
    const { api } = await open('/quiz/q-1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Capitals' })).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('3 questions')).toBeInTheDocument();
    expect(screen.getByText('Multiple choice, True / false, Short answer')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Start quiz' }));
    expect(await screen.findByText('Question 1 of 3 · 0 answered')).toBeInTheDocument();
    expect(requestsTo(api, 'POST /api/quizzes/q-1/attempts')).toHaveLength(1);
  });

  it('renders each question type with the input that suits it', async () => {
    await open('/quiz/q-1', { attempts: [{}] });
    const mc = await screen.findByRole('group', { name: '1. Which city is the capital?' });
    expect(within(mc).getAllByRole('radio').map((radio) => radio.closest('label')?.textContent?.trim())).toEqual(['Lyon', 'Paris', 'Nice']);

    await user.click(screen.getByRole('button', { name: 'Question 2' }));
    const tf = await screen.findByRole('group', { name: '2. Paris is in France.' });
    expect(within(tf).getAllByRole('radio').map((radio) => radio.closest('label')?.textContent?.trim())).toEqual(['True', 'False']);

    await user.click(screen.getByRole('button', { name: 'Question 3' }));
    expect(await screen.findByLabelText('3. Name the capital of France.')).toHaveAttribute('type', 'text');
  });

  it('never shows the answers or explanations while taking the quiz', async () => {
    await open('/quiz/q-1', { attempts: [{}] });
    await screen.findByRole('group', { name: /Which city/ });
    expect(screen.queryByText(/capital of France\.$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Correct answer/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Paris is the capital/)).not.toBeInTheDocument();
  });

  it('saves a chosen option at once and keeps answers while moving between questions', async () => {
    const { api } = await open('/quiz/q-1', { attempts: [{}] });
    await user.click(await screen.findByRole('radio', { name: 'Paris' }));
    await waitFor(() => expect(requestsTo(api, 'PUT /api/attempts/a-1/answers')).toHaveLength(1));
    expect(requestsTo(api, 'PUT /api/attempts/a-1/answers')[0]?.body).toEqual({ answers: [{ questionId: 'k1', answer: 1 }] });
    expect(await screen.findByText('Question 1 of 3 · 1 answered')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Question 2 of 3 · 1 answered')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'False' }));
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByRole('radio', { name: 'Paris' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Lyon' }));
    expect(screen.getByRole('radio', { name: 'Lyon' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Paris' })).not.toBeChecked();
    expect(await screen.findByText('Question 1 of 3 · 2 answered')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /Question 1 of 3/ })).toHaveAttribute('value', '2');
    expect(screen.getByRole('button', { name: 'Question 2, answered' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Question 3' })).toBeInTheDocument();
  });

  it('saves a typed answer when the learner leaves the field and on navigation', async () => {
    const { api } = await open('/quiz/q-1', { attempts: [{}] });
    await user.click(await screen.findByRole('button', { name: 'Question 3' }));
    const field = await screen.findByLabelText('3. Name the capital of France.');
    await user.type(field, 'Paris');
    expect(requestsTo(api, 'PUT /api/attempts/a-1/answers')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await waitFor(() => expect(requestsTo(api, 'PUT /api/attempts/a-1/answers')).toHaveLength(1));
    expect(requestsTo(api, 'PUT /api/attempts/a-1/answers')[0]?.body).toEqual({ answers: [{ questionId: 'k3', answer: 'Paris' }] });
  });

  it('resumes an unsubmitted attempt with its earlier answers after a reload', async () => {
    await open('/quiz/q-1', { attempts: [{ answers: { k1: 1, k2: false, k3: 'Lyon' } }] });
    expect(await screen.findByText('Question 1 of 3 · 3 answered')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Paris' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Question 2, answered' }));
    expect(await screen.findByRole('radio', { name: 'False' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Question 3, answered' }));
    expect(await screen.findByLabelText('3. Name the capital of France.')).toHaveValue('Lyon');
    expect(screen.queryByRole('button', { name: 'Start quiz' })).not.toBeInTheDocument();
  });

  it('keeps the answer on the page and says so when saving fails, then sends it with the submission', async () => {
    const { api } = await open('/quiz/q-1', {
      attempts: [{}],
      onSave: () => errorResponse('INTERNAL', 'Could not save.', 500),
    });
    await user.click(await screen.findByRole('radio', { name: 'Paris' }));
    expect(await screen.findByText(/Your last answer could not be saved/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Paris' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Submit quiz' }));
    await user.click(await screen.findByRole('button', { name: 'Submit anyway' }));
    await screen.findByRole('region', { name: 'Quiz results' });
    expect(requestsTo(api, 'POST /api/attempts/a-1/submit')[0]?.body).toEqual({ answers: [{ questionId: 'k1', answer: 1 }] });
  });

  it('asks before submitting with unanswered questions, and lets the learner go back', async () => {
    const { api } = await open('/quiz/q-1', { attempts: [{ answers: { k1: 1 } }] });
    await user.click(await screen.findByRole('button', { name: 'Submit quiz' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('2 questions are unanswered');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requestsTo(api, 'POST /api/attempts/a-1/submit')).toHaveLength(0);
  });

  it('submits without a question when everything is answered', async () => {
    const { api } = await open('/quiz/q-1', { attempts: [{ answers: { k1: 1, k2: true, k3: 'Paris' } }] });
    await user.click(await screen.findByRole('button', { name: 'Submit quiz' }));
    expect(await screen.findByRole('region', { name: 'Quiz results' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requestsTo(api, 'POST /api/attempts/a-1/submit')).toHaveLength(1);
  });

  it('shows the error and a way to try again when submitting fails', async () => {
    let fail = true;
    await open('/quiz/q-1', {
      attempts: [{ answers: { k1: 1, k2: true, k3: 'Paris' } }],
      onSubmit: () => (fail ? errorResponse('INTERNAL', 'Could not submit.', 500) : jsonResponse({ ...QUIZ_BASE, id: 'a-1', quizId: 'q-1', status: 'submitted', startedAt: '2030-06-15T12:00:00.000Z', submittedAt: '2030-06-15T13:00:00.000Z', score: 3, total: 3, percent: 100, answers: [], results: [] })),
    });
    await user.click(await screen.findByRole('button', { name: 'Submit quiz' }));
    expect(await screen.findByText('Could not submit.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit quiz' })).toBeEnabled();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Quiz results' })).toBeInTheDocument();
  });

  it('shows the result when the attempt was already submitted somewhere else', async () => {
    const server = quizServer({
      attempts: [{ answers: { k1: 1, k2: true, k3: 'Paris' } }],
      onSubmit: () => {
        // Another tab submitted first: the attempt is now locked.
        const attempt = server.attempts[0] as AttemptState;
        attempt.status = 'submitted';
        attempt.score = 3;
        return errorResponse('ATTEMPT_LOCKED', 'This attempt was already submitted.', 409);
      },
    });
    stubApi(server.routes);
    await renderSignedIn('/quiz/q-1');
    await user.click(await screen.findByRole('button', { name: 'Submit quiz' }));
    expect(await screen.findByRole('region', { name: 'Quiz results' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /You scored 3 of 3/ })).toBeInTheDocument();
    expect(screen.queryByText('This attempt was already submitted.')).not.toBeInTheDocument();
  });
});

describe('quiz page: results', () => {
  const submit = async (options: Parameters<typeof quizServer>[0] = {}) => {
    const context = await open('/quiz/q-1', options);
    await user.click(await screen.findByRole('button', { name: 'Submit quiz' }));
    const confirm = screen.queryByRole('button', { name: 'Submit anyway' });
    if (confirm) await user.click(confirm);
    await screen.findByRole('region', { name: 'Quiz results' });
    return context;
  };

  it('shows the score, each answer, the correct answer and the explanation', async () => {
    await submit({ attempts: [{ answers: { k1: 0, k2: true, k3: 'Marseille' } }] });
    expect(screen.getByRole('heading', { level: 2, name: /You scored 1 of 3/ })).toHaveTextContent('(33%)');
    const items = screen.getAllByRole('listitem').filter((item) => item.classList.contains('result'));
    expect(items).toHaveLength(3);

    expect(items[0]).toHaveTextContent('Incorrect');
    expect(items[0]).toHaveTextContent(/Your answer\s*Lyon/);
    expect(items[0]).toHaveTextContent(/Correct answer\s*Paris/);
    expect(items[0]).toHaveTextContent('Paris is the capital of France.');
    expect(items[1]).toHaveTextContent('Correct');
    expect(items[1]).toHaveTextContent(/Your answer\s*True/);
    expect(items[2]).toHaveTextContent(/Your answer\s*Marseille/);
    expect(items[2]).toHaveTextContent(/Correct answer\s*Paris/);
  });

  it('shows a question left blank as unanswered', async () => {
    await submit({ attempts: [{ answers: { k1: 1 } }] });
    const items = screen.getAllByRole('listitem').filter((item) => item.classList.contains('result'));
    expect(items[1]).toHaveTextContent('Unanswered');
    expect(items[1]).toHaveTextContent(/Your answer\s*Unanswered/);
    expect(items[2]).toHaveTextContent('Unanswered');
    expect(screen.getByRole('heading', { level: 2, name: /You scored 1 of 3/ })).toBeInTheDocument();
  });

  it('locks the answers after submission: no inputs remain', async () => {
    await submit({ attempts: [{ answers: { k1: 1 } }] });
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit quiz' })).not.toBeInTheDocument();
  });

  it('shows a perfect score as 100 percent', async () => {
    await submit({ attempts: [{ answers: { k1: 1, k2: true, k3: ' paris. ' } }] });
    expect(screen.getByRole('heading', { level: 2, name: /You scored 3 of 3/ })).toHaveTextContent('(100%)');
  });

  it('shows a submitted attempt when the page is opened, without asking to start', async () => {
    await open('/quiz/q-1', { attempts: [{ status: 'submitted', answers: { k1: 1, k2: true, k3: 'Paris' }, score: 3 }] });
    expect(await screen.findByRole('region', { name: 'Quiz results' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start quiz' })).not.toBeInTheDocument();
  });

  it('starts a new empty attempt on retake and keeps the earlier one in the history', async () => {
    const { api } = await submit({ attempts: [{ answers: { k1: 1 } }] });
    await user.click(screen.getByRole('button', { name: 'Retake this quiz' }));
    expect(await screen.findByText('Question 1 of 3 · 0 answered')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Paris' })).not.toBeChecked();
    expect(requestsTo(api, 'POST /api/quizzes/q-1/attempts')).toHaveLength(1);

    const history = await screen.findByRole('region', { name: 'Attempts' });
    expect(within(history).getByText('1 of 3 (33%)')).toBeInTheDocument();
    expect(within(history).getByText('In progress')).toBeInTheDocument();
    await user.click(within(history).getByRole('button', { name: 'View' }));
    expect(await screen.findByRole('heading', { level: 2, name: /You scored 1 of 3/ })).toBeInTheDocument();
  });

  it('offers a new quiz', async () => {
    await submit({ attempts: [{ answers: { k1: 1 } }] });
    expect(screen.getByRole('link', { name: 'New quiz' })).toHaveAttribute('href', '/quiz');
  });

  it('shows why a retake could not start', async () => {
    await submit({ attempts: [{ answers: { k1: 1 } }], onStart: () => errorResponse('INTERNAL', 'Could not start.', 500) });
    await user.click(screen.getByRole('button', { name: 'Retake this quiz' }));
    expect(await screen.findByText('Could not start.')).toBeInTheDocument();
  });
});

describe('quiz page: AI review of short answers', () => {
  const submitWrong = async (options: Parameters<typeof quizServer>[0] = {}) => {
    const context = await open('/quiz/q-1', { attempts: [{ answers: { k1: 0, k2: true, k3: 'the French capital' } }], ...options });
    await user.click(await screen.findByRole('button', { name: 'Submit quiz' }));
    await screen.findByRole('region', { name: 'Quiz results' });
    return context;
  };

  it('offers a review only for an incorrect short answer', async () => {
    await submitWrong();
    expect(screen.getAllByRole('button', { name: 'Ask AI to review' })).toHaveLength(1);
  });

  it('shows a labelled review and leaves the score alone', async () => {
    const { api } = await submitWrong();
    await user.click(screen.getByRole('button', { name: 'Ask AI to review' }));
    expect(await screen.findByText('AI-judged review.', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/The AI considers your answer acceptable\. That means the same thing\./)).toBeInTheDocument();
    expect(screen.getByText('AI-judged review. It does not change your score.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /You scored 1 of 3/ })).toBeInTheDocument();
    const third = screen.getAllByRole('listitem').filter((item) => item.classList.contains('result'))[2];
    expect(third).toHaveTextContent('Incorrect');
    expect(screen.queryByRole('button', { name: 'Ask AI to review' })).not.toBeInTheDocument();
    expect(requestsTo(api, 'POST /api/attempts/a-1/answers/k3/review')).toHaveLength(1);
  });

  it('shows the AI saying the answer is not acceptable', async () => {
    await submitWrong({ onReview: () => jsonResponse({ questionId: 'k3', type: 'short_answer', statement: 'Name the capital of France.', answer: 'the French capital', correct: false, correctAnswer: ['Paris'], explanation: 'The capital is Paris.', aiReview: { verdict: 'not_acceptable', feedback: 'It is not a name.' } }) });
    await user.click(screen.getByRole('button', { name: 'Ask AI to review' }));
    expect(await screen.findByText(/The AI does not consider your answer acceptable\. It is not a name\./)).toBeInTheDocument();
  });

  it('shows the reason and keeps the result when the review fails', async () => {
    await submitWrong({ onReview: () => errorResponse('AI_UNAVAILABLE', 'The AI service is not available right now.', 502) });
    await user.click(screen.getByRole('button', { name: 'Ask AI to review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The AI service is not available right now.');
    expect(screen.getByRole('button', { name: 'Ask AI to review' })).toBeEnabled();
    expect(screen.getByRole('heading', { level: 2, name: /You scored 1 of 3/ })).toBeInTheDocument();
  });

  it('disables the review and says why when the daily limit is used up', async () => {
    const resetsAt = new Date(Date.now() + 3_600_000);
    await submitWrong({ onReview: () => errorResponse('AI_QUOTA_EXCEEDED', 'Daily limit reached.', 429, { resetsAt: resetsAt.toISOString() }) });
    await user.click(screen.getByRole('button', { name: 'Ask AI to review' }));
    expect(await screen.findByText(/Review unavailable\. You have used your daily AI requests/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask AI to review' })).toBeDisabled();
    expect(screen.getByRole('heading', { level: 2, name: /You scored 1 of 3/ })).toBeInTheDocument();
  });

  it('disables the review when AI is not configured', async () => {
    await submitWrong({ configured: false });
    expect(screen.getByRole('button', { name: 'Ask AI to review' })).toBeDisabled();
    expect(screen.getByText(/Review unavailable\. Quiz generation is not available on this server\./)).toBeInTheDocument();
  });

  it('disables the review for an unverified account', async () => {
    await submitWrong({ verified: false });
    expect(screen.getByRole('button', { name: 'Ask AI to review' })).toBeDisabled();
    expect(screen.getByText(/Review unavailable\. Verify your email address/)).toBeInTheDocument();
  });
});

describe('quiz page: loading and missing quizzes', () => {
  it('says when the quiz is not found', async () => {
    const server = quizServer();
    stubApi({ ...server.routes, 'GET /api/quizzes/q-1': () => errorResponse('NOT_FOUND', 'Not found.', 404) });
    await renderSignedIn('/quiz/q-1');
    expect(await screen.findByText('This quiz was not found.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All quizzes' })).toHaveAttribute('href', '/quiz');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('shows an error with a retry when the quiz cannot be loaded', async () => {
    let fail = true;
    const server = quizServer();
    stubApi({ ...server.routes, 'GET /api/quizzes/q-1': () => (fail ? errorResponse('INTERNAL', 'The quiz is unavailable.', 500) : jsonResponse(QUIZ)) });
    await renderSignedIn('/quiz/q-1');
    expect(await screen.findByText('The quiz is unavailable.')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Capitals' })).toBeInTheDocument();
  });

  it('shows an error with a retry when the attempts cannot be loaded', async () => {
    let fail = true;
    const server = quizServer();
    stubApi({ ...server.routes, 'GET /api/quizzes/q-1/attempts': () => (fail ? errorResponse('INTERNAL', 'Attempts are unavailable.', 500) : jsonResponse({ items: [] })) });
    await renderSignedIn('/quiz/q-1');
    expect(await screen.findByText('Attempts are unavailable.')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Start quiz' })).toBeInTheDocument();
  });

  it('shows why the quiz could not be started', async () => {
    await open('/quiz/q-1', { onStart: () => errorResponse('INTERNAL', 'Could not start.', 500) });
    await user.click(await screen.findByRole('button', { name: 'Start quiz' }));
    expect(await screen.findByText('Could not start.')).toBeInTheDocument();
  });

  it('says when a quiz covers only the start of a long material', async () => {
    const server = quizServer();
    stubApi({ ...server.routes, 'GET /api/quizzes/q-1': () => jsonResponse({ ...QUIZ, source: 'material', materialId: 'm-1', materialName: 'biology.txt', sourceChars: 24000, sourcePartial: true }) });
    await renderSignedIn('/quiz/q-1');
    expect(await screen.findByText(/questions come from its first 24,000 characters \(biology\.txt\)/)).toBeInTheDocument();
  });

  it('is reachable from the navigation', async () => {
    await open('/');
    await user.click((await screen.findAllByRole('link', { name: 'Quiz' }))[0] as HTMLElement);
    expect(await screen.findByRole('heading', { level: 1, name: 'Quiz' })).toBeInTheDocument();
  });
});
