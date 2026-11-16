import { useState } from 'react';
import type { Material } from '../api/materials';
import { formatBytes } from '../materials/fileRules';
import { SummaryPanel } from './SummaryPanel';

const STATUS_LABEL = { processing: 'Processing', ready: 'Ready', failed: 'Failed' } as const;

export function MaterialItem({ material, onDelete }: { material: Material; onDelete: () => void }) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  return (
    <li className="material">
      <div className="material-body">
        <p className="material-name">{material.name}</p>
        <p className="task-meta">
          <span className={`badge badge-${material.status}`}>{STATUS_LABEL[material.status]}</span>
          <span>{material.fileType.toUpperCase()}</span>
          <span>{formatBytes(material.sizeBytes)}</span>
          {material.status === 'ready' && <span>{material.charCount.toLocaleString()} characters</span>}
        </p>
        {material.status === 'ready' && material.truncated && (
          <p className="text-muted">This document was long, so only the first {material.charCount.toLocaleString()} characters were kept.</p>
        )}
        {material.status === 'failed' && material.failureReason && <p className="field-error">{material.failureReason}</p>}
        {summaryOpen && <SummaryPanel materialId={material.id} name={material.name} />}
      </div>
      <div className="upload-actions">
        {material.status === 'ready' && (
          <button
            type="button"
            className="button button-quiet"
            aria-expanded={summaryOpen}
            aria-label={`Summary: ${material.name}`}
            onClick={() => setSummaryOpen((open) => !open)}
          >
            {summaryOpen ? 'Hide summary' : 'Summary'}
          </button>
        )}
        <button type="button" className="button button-quiet" onClick={onDelete} aria-label={`Delete: ${material.name}`}>
          Delete
        </button>
      </div>
    </li>
  );
}
