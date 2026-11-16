import { useRef, useState, type DragEvent } from 'react';
import { MATERIAL_ACCEPT, MATERIAL_FORMATS_TEXT } from '../constants';
import { formatBytes } from '../materials/fileRules';

interface Props {
  maxBytes: number;
  onFiles: (files: File[]) => void;
}

const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files');

export function MaterialDropzone({ maxBytes, onFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const keepDrag = (event: DragEvent) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    setDragging(true);
  };

  return (
    <div
      className={`dropzone${dragging ? ' dropzone-active' : ''}`}
      onDragEnter={keepDrag}
      onDragOver={keepDrag}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        setDragging(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) onFiles(files);
      }}
    >
      <p className="dropzone-title">Drag and drop files here</p>
      <button type="button" className="button" onClick={() => inputRef.current?.click()}>
        Choose files
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept={MATERIAL_ACCEPT}
        aria-label="Choose files to upload"
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          // Lets the same file be chosen again later.
          event.target.value = '';
        }}
      />
      <p className="text-muted">
        Supported formats: {MATERIAL_FORMATS_TEXT}. Up to {formatBytes(maxBytes)} each.
      </p>
    </div>
  );
}
