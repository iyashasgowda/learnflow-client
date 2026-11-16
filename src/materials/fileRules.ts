import { BYTES_PER_KB, BYTES_PER_MB, MATERIAL_EXTENSIONS, MATERIAL_FORMATS_TEXT } from '../constants';

const ONE_DECIMAL = 10;

export function formatBytes(bytes: number): string {
  if (bytes >= BYTES_PER_MB) return `${Math.round((bytes / BYTES_PER_MB) * ONE_DECIMAL) / ONE_DECIMAL} MB`;
  if (bytes >= BYTES_PER_KB) return `${Math.round(bytes / BYTES_PER_KB)} KB`;
  return `${bytes} B`;
}

const hasSupportedExtension = (name: string): boolean => {
  const lower = name.toLowerCase();
  return MATERIAL_EXTENSIONS.some((extension) => lower.endsWith(extension));
};

// The quick checks made before sending; the server repeats them and also checks the content itself.
export function checkFile(file: File, maxBytes: number): string | null {
  if (!hasSupportedExtension(file.name)) return `This file type is not supported. Supported formats: ${MATERIAL_FORMATS_TEXT}.`;
  if (file.size === 0) return 'This file is empty. Choose a file that contains text.';
  if (file.size > maxBytes) return `This file is larger than the ${formatBytes(maxBytes)} limit.`;
  return null;
}
