import { ApiError } from '../api/client';
import { useAuth } from '../auth/authContext';
import { aiBlockerFor, noticeForError } from '../chat/availability';
import { useAiConfigured } from '../chat/hooks';
import { ERROR_CODES, MESSAGES, SUMMARY_MESSAGES } from '../constants';
import { useGenerateSummary, useSummary } from '../summaries/hooks';
import { useFormatters } from '../settings/useFormatters';
import { AiDisclosureGate } from './AiDisclosureGate';
import { Markdown } from './Markdown';

const sectionsText = (count: number): string => `${count} ${count === 1 ? 'section' : 'sections'}`;

export function SummaryPanel({ materialId, name }: { materialId: string; name: string }) {
  const { state } = useAuth();
  const { dateTime, time } = useFormatters();
  const emailVerified = state.status === 'authenticated' && state.user.emailVerified;
  const aiConfigured = useAiConfigured().data;
  const summary = useSummary(materialId);
  const generate = useGenerateSummary(materialId);

  const failure = generate.error;
  const notice = failure instanceof ApiError ? noticeForError(failure) : null;
  // Why a summary cannot be requested at all right now; the button and the explanation both follow this.
  const blocker = aiBlockerFor(SUMMARY_MESSAGES, { aiConfigured, emailVerified, notice });
  const generateFailed = failure !== null && blocker === null;
  // An oversized document stays oversized, so asking again cannot help.
  const tooLarge = failure instanceof ApiError && failure.code === ERROR_CODES.DOCUMENT_TOO_LARGE;
  const current = summary.data ?? null;

  return (
    <section className="summary" aria-label={`Summary of ${name}`}>
      {summary.isPending && <p className="text-muted">{SUMMARY_MESSAGES.loading}</p>}
      {summary.isError && (
        <p className="field-error" role="alert">
          {SUMMARY_MESSAGES.loadFailed}{' '}
          <button type="button" className="button button-quiet" onClick={() => void summary.refetch()}>
            Retry
          </button>
        </p>
      )}
      {current && (
        <>
          <Markdown text={current.text} />
          <p className="task-meta">
            <span>Written {dateTime(current.createdAt)}</span>
            <span>{sectionsText(current.sectionCount)}</span>
            <span>{current.model}</span>
          </p>
          {current.truncated && (
            <p className="text-muted">
              This document was long, so the summary covers only the first {current.sourceChars.toLocaleString()} characters that were kept.
            </p>
          )}
        </>
      )}
      {summary.isSuccess && !current && !generate.isPending && <p className="text-muted">{SUMMARY_MESSAGES.none}</p>}
      {generate.isPending && (
        <div role="status">
          <p className="text-muted">{SUMMARY_MESSAGES.generating}</p>
          <progress aria-label={`Summarizing ${name}`} />
        </div>
      )}
      {generateFailed && (
        <p className="field-error" role="alert">
          {failure instanceof Error ? failure.message : MESSAGES.generic}
        </p>
      )}
      {blocker && (
        <p className="notice" role="status">
          {blocker.message}
          {blocker.resetsAt !== null && ` They reset at ${time(blocker.resetsAt)}.`}
        </p>
      )}
      {(summary.isSuccess || current) && (
        <AiDisclosureGate>
          <button
            type="button"
            className="button"
            disabled={generate.isPending || blocker !== null || tooLarge}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? 'Summarizing…' : current ? 'Regenerate summary' : 'Generate summary'}
          </button>
        </AiDisclosureGate>
      )}
    </section>
  );
}
