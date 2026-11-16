import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeMaterial, materialList } from './fakeXhr';
import { errorResponse, jsonResponse, renderSignedIn, SETTINGS, stubApi, USER } from './testUtils';
import { formatDateTime, formatTime } from '../src/time/zone';
import type { RecordedRequest } from './testUtils';

const user = userEvent.setup();

const SUMMARY_URL = 'material-1/summary';

const makeSummary = (overrides: Record<string, unknown> = {}) => ({
  materialId: 'material-1',
  text: '## Overview\n\nPhotosynthesis turns light into sugar.',
  model: 'gpt-test',
  sectionCount: 1,
  truncated: false,
  sourceChars: 1500,
  createdAt: '2030-01-02T03:04:05.000Z',
  ...overrides,
});

const noSummary = () => errorResponse('NOT_FOUND', 'This material has no summary yet.', 404);

interface Setup {
  get?: () => Response | Promise<Response>;
  post?: (request: RecordedRequest) => Response | Promise<Response>;
  configured?: boolean;
  verified?: boolean;
  materials?: ReturnType<typeof makeMaterial>[];
}

// Opens the summary of the first material on the Materials page.
async function openSummary({ get = noSummary, post, configured = true, verified = true, materials = [makeMaterial()] }: Setup = {}) {
  const posts: RecordedRequest[] = [];
  stubApi({
    'GET /api/health': () => jsonResponse({ status: 'ok', ai: { configured } }),
    'GET /api/auth/me': () => jsonResponse({ user: { ...USER, emailVerified: verified } }),
    'GET /api/materials': () => jsonResponse(materialList(materials)),
    [`GET /api/materials/${SUMMARY_URL}`]: get,
    [`POST /api/materials/${SUMMARY_URL}`]: (request) => {
      posts.push(request);
      return post ? post(request) : jsonResponse(makeSummary(), 201);
    },
  });
  await renderSignedIn('/materials');
  await user.click(await screen.findByRole('button', { name: 'Summary: notes.txt' }));
  return { posts };
}

const panel = () => screen.getByRole('region', { name: 'Summary of notes.txt' });
const generateButton = (name: string | RegExp = /generate summary|regenerate summary|summarizing/i) =>
  within(panel()).getByRole('button', { name });

describe('Summary panel', () => {
  it('offers a summary only for materials that are ready', async () => {
    stubApi({
      'GET /api/materials': () =>
        jsonResponse(
          materialList([
            makeMaterial({ id: 'm-1', name: 'ready.txt' }),
            makeMaterial({ id: 'm-2', name: 'busy.txt', status: 'processing' }),
            makeMaterial({ id: 'm-3', name: 'bad.txt', status: 'failed', failureReason: 'Cannot read this file.' }),
          ]),
        ),
    });
    await renderSignedIn('/materials');
    expect(await screen.findByRole('button', { name: 'Summary: ready.txt' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Summary: busy.txt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Summary: bad.txt' })).not.toBeInTheDocument();
  });

  it('opens and closes the panel without touching the server until it is opened', async () => {
    const api = stubApi({
      'GET /api/materials': () => jsonResponse(materialList([makeMaterial()])),
      [`GET /api/materials/${SUMMARY_URL}`]: noSummary,
    });
    await renderSignedIn('/materials');
    const toggle = await screen.findByRole('button', { name: 'Summary: notes.txt' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(api.calls.some((call) => call.path.includes('/summary'))).toBe(false);
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('No summary yet.')).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.queryByRole('region', { name: 'Summary of notes.txt' })).not.toBeInTheDocument();
  });

  it('shows a loading message while the summary is fetched', async () => {
    let release: (response: Response) => void = () => undefined;
    await openSummary({ get: () => new Promise<Response>((resolve) => (release = resolve)) });
    expect(screen.getByText('Loading summary…')).toBeInTheDocument();
    release(jsonResponse(makeSummary()));
    expect(await screen.findByText(/Photosynthesis turns light into sugar/)).toBeInTheDocument();
    expect(screen.queryByText('Loading summary…')).not.toBeInTheDocument();
  });

  it('offers to generate when there is no summary, then shows the result', async () => {
    await openSummary();
    expect(await screen.findByText('No summary yet.')).toBeInTheDocument();
    await user.click(generateButton('Generate summary'));
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText(/Photosynthesis turns light into sugar/)).toBeInTheDocument();
    expect(screen.queryByText('No summary yet.')).not.toBeInTheDocument();
    expect(generateButton()).toHaveTextContent('Regenerate summary');
  });

  it('shows progress and blocks a second request while generating', async () => {
    let release: (response: Response) => void = () => undefined;
    const { posts } = await openSummary({ post: () => new Promise<Response>((resolve) => (release = resolve)) });
    await screen.findByText('No summary yet.');
    await user.click(generateButton('Generate summary'));
    expect(await within(panel()).findByRole('status')).toHaveTextContent(/can take a minute or more/);
    expect(within(panel()).getByRole('progressbar', { name: 'Summarizing notes.txt' })).toBeInTheDocument();
    expect(screen.queryByText('No summary yet.')).not.toBeInTheDocument();
    expect(generateButton('Summarizing…')).toBeDisabled();
    expect(posts).toHaveLength(1);
    release(jsonResponse(makeSummary(), 201));
    expect(await screen.findByText(/Photosynthesis turns light into sugar/)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows when it was written, how many sections were read and which model wrote it', async () => {
    await openSummary({ get: () => jsonResponse(makeSummary({ sectionCount: 3 })) });
    expect(await screen.findByText('3 sections')).toBeInTheDocument();
    expect(screen.getByText('gpt-test')).toBeInTheDocument();
    expect(screen.getByText(`Written ${formatDateTime('2030-01-02T03:04:05.000Z', SETTINGS.timeZone)}`)).toBeInTheDocument();
    expect(screen.queryByText(/covers only the first/)).not.toBeInTheDocument();
  });

  it('uses the singular for a single section', async () => {
    await openSummary({ get: () => jsonResponse(makeSummary()) });
    expect(await screen.findByText('1 section')).toBeInTheDocument();
  });

  it('says so when the summary covers only the part of a long document that was kept', async () => {
    await openSummary({ get: () => jsonResponse(makeSummary({ truncated: true, sourceChars: 200000 })) });
    expect(await screen.findByText(/covers only the first 200,000 characters that were kept/)).toBeInTheDocument();
  });

  it('replaces the summary when it is regenerated', async () => {
    await openSummary({
      get: () => jsonResponse(makeSummary()),
      post: () => jsonResponse(makeSummary({ text: 'A fresh, shorter summary.', sectionCount: 2 }), 201),
    });
    await screen.findByText(/Photosynthesis/);
    await user.click(generateButton('Regenerate summary'));
    expect(await screen.findByText('A fresh, shorter summary.')).toBeInTheDocument();
    expect(screen.queryByText(/Photosynthesis/)).not.toBeInTheDocument();
    expect(screen.getByText('2 sections')).toBeInTheDocument();
  });

  it('keeps the previous summary on screen when regenerating fails', async () => {
    await openSummary({
      get: () => jsonResponse(makeSummary()),
      post: () => errorResponse('AI_UPSTREAM', 'The AI provider had a problem. Please try again.', 502),
    });
    await screen.findByText(/Photosynthesis/);
    await user.click(generateButton('Regenerate summary'));
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('The AI provider had a problem. Please try again.');
    expect(screen.getByText(/Photosynthesis turns light into sugar/)).toBeInTheDocument();
    expect(generateButton()).toBeEnabled();
  });

  it('can try again after a failure and clears the error when it works', async () => {
    let fail = true;
    await openSummary({
      post: () => (fail ? errorResponse('AI_TIMEOUT', 'The AI took too long. Please try again.', 504) : jsonResponse(makeSummary(), 201)),
    });
    await screen.findByText('No summary yet.');
    await user.click(generateButton('Generate summary'));
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('The AI took too long');
    fail = false;
    await user.click(generateButton('Generate summary'));
    expect(await screen.findByText(/Photosynthesis/)).toBeInTheDocument();
    expect(within(panel()).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('explains a network failure', async () => {
    await openSummary({ post: () => Promise.reject(new TypeError('Failed to fetch')) });
    await screen.findByText('No summary yet.');
    await user.click(generateButton('Generate summary'));
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('Cannot reach the server');
  });

  it('shows an error with a retry when the summary cannot be loaded', async () => {
    let fail = true;
    await openSummary({ get: () => (fail ? errorResponse('INTERNAL', 'Something broke.', 500) : jsonResponse(makeSummary())) });
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('The summary could not be loaded.');
    expect(within(panel()).queryByRole('button', { name: /generate summary/i })).not.toBeInTheDocument();
    fail = false;
    await user.click(within(panel()).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/Photosynthesis/)).toBeInTheDocument();
  });
});

describe('Summary panel when the AI cannot be used', () => {
  it('tells the user the daily limit was reached, with the reset time, and keeps the summary visible', async () => {
    const resetsAt = new Date(Date.now() + 3_600_000);
    await openSummary({
      get: () => jsonResponse(makeSummary()),
      post: () => errorResponse('AI_QUOTA_EXCEEDED', 'Daily limit reached.', 429, { resetsAt: resetsAt.toISOString() }),
    });
    await screen.findByText(/Photosynthesis/);
    await user.click(generateButton('Regenerate summary'));
    const notice = await screen.findByText(/You have used your daily AI requests/);
    expect(notice).toHaveTextContent(`They reset at ${formatTime(resetsAt, SETTINGS.timeZone)}.`);
    expect(screen.getByText(/Photosynthesis turns light into sugar/)).toBeInTheDocument();
    expect(generateButton()).toBeDisabled();
    expect(within(panel()).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('allows another try once the reset time has passed', async () => {
    await openSummary({
      post: () => errorResponse('AI_QUOTA_EXCEEDED', 'Daily limit reached.', 429, { resetsAt: new Date(Date.now() - 1000).toISOString() }),
    });
    await screen.findByText('No summary yet.');
    await user.click(generateButton('Generate summary'));
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('Daily limit reached.');
    expect(generateButton()).toBeEnabled();
  });

  it('blocks the button without a reset time when the server gives none', async () => {
    await openSummary({ post: () => errorResponse('AI_QUOTA_EXCEEDED', 'Daily limit reached.', 429) });
    await screen.findByText('No summary yet.');
    await user.click(generateButton('Generate summary'));
    const notice = await screen.findByText(/You have used your daily AI requests/);
    expect(notice).not.toHaveTextContent('reset at');
    expect(generateButton()).toBeDisabled();
  });

  it('explains that summaries are unavailable when the server has no AI configured, and sends nothing', async () => {
    const { posts } = await openSummary({ configured: false });
    expect(await screen.findByText('Summaries are not available on this server.')).toBeInTheDocument();
    expect(await screen.findByText('No summary yet.')).toBeInTheDocument();
    expect(generateButton('Generate summary')).toBeDisabled();
    expect(posts).toHaveLength(0);
  });

  it('shows an existing summary even when the AI is not configured', async () => {
    await openSummary({ configured: false, get: () => jsonResponse(makeSummary()) });
    expect(await screen.findByText(/Photosynthesis turns light into sugar/)).toBeInTheDocument();
    expect(screen.getByText('Summaries are not available on this server.')).toBeInTheDocument();
    expect(generateButton()).toBeDisabled();
  });

  it('learns that the AI is not configured from the answer to a request', async () => {
    await openSummary({ post: () => errorResponse('AI_NOT_CONFIGURED', 'The AI is not set up.', 503) });
    await screen.findByText('No summary yet.');
    await user.click(generateButton('Generate summary'));
    expect(await screen.findByText('Summaries are not available on this server.')).toBeInTheDocument();
    expect(generateButton()).toBeDisabled();
  });

  it('tells the user when summaries are paused for the day', async () => {
    await openSummary({ post: () => errorResponse('AI_BUDGET_PAUSED', 'Paused.', 503) });
    await screen.findByText('No summary yet.');
    await user.click(generateButton('Generate summary'));
    expect(await screen.findByText('Summaries are paused for today.')).toBeInTheDocument();
    expect(generateButton()).toBeDisabled();
  });

  it('asks the user to verify their email and does not offer to generate', async () => {
    const { posts } = await openSummary({ verified: false });
    expect(await screen.findByText('Verify your email address to generate summaries.')).toBeInTheDocument();
    expect(await screen.findByText('No summary yet.')).toBeInTheDocument();
    expect(generateButton('Generate summary')).toBeDisabled();
    expect(posts).toHaveLength(0);
  });

  it('explains that an oversized document cannot be summarized and stops offering to try', async () => {
    await openSummary({
      post: () => errorResponse('DOCUMENT_TOO_LARGE', 'This document is too long to summarize.', 422),
    });
    await screen.findByText('No summary yet.');
    await user.click(generateButton('Generate summary'));
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('This document is too long to summarize.');
    expect(generateButton()).toBeDisabled();
  });

  it('shows the server message when the material is no longer ready', async () => {
    await openSummary({ post: () => errorResponse('MATERIAL_NOT_READY', 'This material is still being processed.', 409) });
    await screen.findByText('No summary yet.');
    await user.click(generateButton('Generate summary'));
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('This material is still being processed.');
    expect(generateButton()).toBeEnabled();
  });
});
