import { PERCENT } from '../constants';
import { formatBytes } from '../materials/fileRules';
import { isInFlight, type UploadRow } from '../materials/useUploadQueue';

interface Props {
  rows: UploadRow[];
  onRetry: (id: number) => void;
  onDismiss: (id: number) => void;
  onClearFinished: () => void;
}

const STATUS_TEXT = {
  queued: 'Waiting for its turn…',
  uploading: 'Uploading…',
  processing: 'Reading the document…',
  ready: 'Ready',
  failed: 'Failed',
} as const;

function UploadItem({ row, onRetry, onDismiss }: { row: UploadRow; onRetry: Props['onRetry']; onDismiss: Props['onDismiss'] }) {
  const percent = Math.round(row.progress * PERCENT);
  return (
    <li className={`upload upload-${row.status}`}>
      <div className="upload-body">
        <p className="upload-name">
          {row.file.name} <span className="text-muted">({formatBytes(row.file.size)})</span>
        </p>
        {row.status === 'uploading' && <progress max={PERCENT} value={percent} aria-label={`Uploading ${row.file.name}`} />}
        {row.status === 'processing' && <progress aria-label={`Reading ${row.file.name}`} />}
        <p role="status" className="upload-status">
          {STATUS_TEXT[row.status]}
          {row.status === 'uploading' && ` ${percent}%`}
          {row.message && ` ${row.message}`}
        </p>
      </div>
      <div className="upload-actions">
        {row.status === 'failed' && row.canRetry && (
          <button type="button" className="button" onClick={() => onRetry(row.id)} aria-label={`Retry: ${row.file.name}`}>
            Retry
          </button>
        )}
        {!isInFlight(row) && (
          <button type="button" className="button button-quiet" onClick={() => onDismiss(row.id)} aria-label={`Dismiss: ${row.file.name}`}>
            Dismiss
          </button>
        )}
      </div>
    </li>
  );
}

export function UploadList({ rows, onRetry, onDismiss, onClearFinished }: Props) {
  if (rows.length === 0) return null;
  const finished = rows.filter((row) => !isInFlight(row)).length;
  return (
    <>
      <ul className="upload-list" aria-label="Uploads">
        {rows.map((row) => (
          <UploadItem key={row.id} row={row} onRetry={onRetry} onDismiss={onDismiss} />
        ))}
      </ul>
      {finished > 1 && (
        <button type="button" className="button button-quiet" onClick={onClearFinished}>
          Clear finished
        </button>
      )}
    </>
  );
}
