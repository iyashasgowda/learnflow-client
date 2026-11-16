import { describe, expect, it } from 'vitest';
import { checkFile, formatBytes } from '../src/materials/fileRules';
import { makeFile } from './fakeXhr';

const MB = 1024 * 1024;

describe('formatBytes', () => {
  it('uses bytes, kilobytes, and megabytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('2 KB');
    expect(formatBytes(MB)).toBe('1 MB');
    expect(formatBytes(50 * MB)).toBe('50 MB');
    expect(formatBytes(1.55 * MB)).toBe('1.6 MB');
  });
});

describe('checkFile', () => {
  it('accepts each supported type in any letter case', () => {
    for (const name of ['a.txt', 'a.md', 'a.pdf', 'a.docx', 'NOTES.PDF', 'Chapter 1.DocX']) {
      expect(checkFile(makeFile(name), MB), name).toBeNull();
    }
  });

  it('rejects other types and lists the supported ones', () => {
    for (const name of ['virus.exe', 'photo.png', 'old.doc', 'noextension', 'archive.txt.zip']) {
      expect(checkFile(makeFile(name), MB), name).toBe('This file type is not supported. Supported formats: .txt, .md, .pdf, .docx.');
    }
  });

  it('rejects an empty file', () => {
    expect(checkFile(makeFile('a.txt', 0), MB)).toBe('This file is empty. Choose a file that contains text.');
  });

  it('rejects a file over the limit and states the limit', () => {
    expect(checkFile(makeFile('big.pdf', 2 * MB + 1), 2 * MB)).toBe('This file is larger than the 2 MB limit.');
    expect(checkFile(makeFile('big.pdf', 3 * MB), 2 * MB)).toBe('This file is larger than the 2 MB limit.');
  });

  it('accepts a file of exactly the limit', () => {
    expect(checkFile(makeFile('edge.txt', MB), MB)).toBeNull();
  });
});
