import type { Availability } from '../chat/availability';
import { useFormatters } from '../settings/useFormatters';

export function AiBanners({ aiConfigured, emailVerified, notice }: Availability) {
  const { dateTime } = useFormatters();
  const formatReset = (resetsAt: number | null): string => (resetsAt === null ? 'later today' : dateTime(new Date(resetsAt)));
  return (
    <>
      {!emailVerified && (
        <div role="status" className="notice">
          <p>Verify your email address to use the assistant. Check your inbox, or resend the link from the banner at the top of the page.</p>
        </div>
      )}
      {(aiConfigured === false || notice?.kind === 'unconfigured') && (
        <div role="status" className="notice">
          <p>The AI assistant is not set up on this server yet, so it cannot answer. Your conversations are still available.</p>
        </div>
      )}
      {notice?.kind === 'budget' && (
        <div role="status" className="notice">
          <p>AI features are paused for today because the shared daily budget has been used. Please try again tomorrow.</p>
        </div>
      )}
      {notice?.kind === 'quota' && (
        <div role="status" className="notice">
          <p>You have used your AI requests for today. They reset at {formatReset(notice.resetsAt)}. Your conversations stay available.</p>
        </div>
      )}
    </>
  );
}
