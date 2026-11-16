import { useEffect, useRef, useState } from 'react';
import { ApiError, NetworkError } from '../api/client';
import { uploadMaterial, type Material } from '../api/materials';
import { ERROR_CODES, HTTP_SERVER_ERROR_FROM, MESSAGES } from '../constants';
import { checkFile } from './fileRules';

export type UploadStatus = 'queued' | 'uploading' | 'processing' | 'ready' | 'failed';

export interface UploadRow {
  id: number;
  file: File;
  status: UploadStatus;
  // Fraction sent, from 0 to 1.
  progress: number;
  message: string | null;
  canRetry: boolean;
}

const IN_FLIGHT: readonly UploadStatus[] = ['queued', 'uploading', 'processing'];
const MESSAGE_CONNECTION_LOST = 'The connection was lost. Check your connection and retry.';

export const isInFlight = (row: UploadRow): boolean => IN_FLIGHT.includes(row.status);

function describeReady(material: Material): string {
  const kept = `${material.charCount.toLocaleString()} characters extracted.`;
  return material.truncated ? `${kept} The document is long, so only the first ${material.charCount.toLocaleString()} characters were kept.` : kept;
}

function outcomeOf(material: Material): Partial<UploadRow> {
  if (material.status === 'failed') return { status: 'failed', progress: 1, message: material.failureReason ?? MESSAGES.generic, canRetry: false };
  return { status: 'ready', progress: 1, message: describeReady(material), canRetry: false };
}

function failureOf(error: unknown): Partial<UploadRow> {
  if (error instanceof NetworkError) return { status: 'failed', message: MESSAGE_CONNECTION_LOST, canRetry: true };
  if (error instanceof ApiError) {
    // Server rejections of the file itself cannot be fixed by trying again; busy and server errors can.
    return { status: 'failed', message: error.message, canRetry: error.status >= HTTP_SERVER_ERROR_FROM || error.code === ERROR_CODES.UPLOAD_IN_PROGRESS };
  }
  return { status: 'failed', message: MESSAGES.generic, canRetry: true };
}

// Files are sent one at a time, because the server reads one upload per user at a time.
export function useUploadQueue(maxBytes: number, onSettled: () => void) {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [notice, setNotice] = useState('');
  const rowsRef = useRef<UploadRow[]>([]);
  const running = useRef(false);
  const nextId = useRef(1);
  const settledRef = useRef(onSettled);
  useEffect(() => {
    settledRef.current = onSettled;
  });

  const commit = (next: UploadRow[]) => {
    rowsRef.current = next;
    setRows(next);
  };
  const patch = (id: number, changes: Partial<UploadRow>) => commit(rowsRef.current.map((row) => (row.id === id ? { ...row, ...changes } : row)));

  const send = async (row: UploadRow) => {
    patch(row.id, { status: 'uploading', progress: 0, message: null, canRetry: false });
    try {
      const material = await uploadMaterial(row.file, {
        onProgress: (progress) => patch(row.id, { progress }),
        onSent: () => patch(row.id, { status: 'processing', progress: 1 }),
      });
      patch(row.id, outcomeOf(material));
    } catch (error) {
      patch(row.id, failureOf(error));
    } finally {
      settledRef.current();
    }
  };

  const pump = async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (let next = rowsRef.current.find((row) => row.status === 'queued'); next; next = rowsRef.current.find((row) => row.status === 'queued')) {
        await send(next);
      }
    } finally {
      running.current = false;
    }
  };

  const enqueue = (files: File[]) => {
    const added: UploadRow[] = [];
    const duplicates: string[] = [];
    for (const file of files) {
      const known = [...rowsRef.current, ...added];
      // The same name and size while it is still queued or in flight is the same upload.
      if (known.some((row) => isInFlight(row) && row.file.name === file.name && row.file.size === file.size)) {
        duplicates.push(file.name);
        continue;
      }
      const problem = checkFile(file, maxBytes);
      const base = { id: nextId.current, file, progress: 0, canRetry: false };
      nextId.current += 1;
      added.push(problem ? { ...base, status: 'failed', message: problem } : { ...base, status: 'queued', message: null });
    }
    setNotice(duplicates.length > 0 ? `${duplicates.join(', ')} ${duplicates.length > 1 ? 'are' : 'is'} already being uploaded.` : '');
    commit([...rowsRef.current, ...added]);
    void pump();
  };

  const retry = (id: number) => {
    const row = rowsRef.current.find((item) => item.id === id);
    if (!row || row.status !== 'failed' || !row.canRetry) return;
    patch(id, { status: 'queued', progress: 0, message: null, canRetry: false });
    void pump();
  };

  const dismiss = (id: number) => commit(rowsRef.current.filter((row) => row.id !== id || isInFlight(row)));
  const clearFinished = () => commit(rowsRef.current.filter(isInFlight));

  return { rows, notice, enqueue, retry, dismiss, clearFinished };
}
