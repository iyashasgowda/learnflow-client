import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SECRET_NAME = /(KEY|SECRET|PASSWORD|TOKEN|CREDENTIAL)/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : [full];
  });
}

describe('client secrets hygiene', () => {
  it('has no secret-looking VITE_ variables in .env.example', () => {
    const lines = readFileSync(join(ROOT, '.env.example'), 'utf8').split('\n');
    const names = lines.filter((line) => /^\s*VITE_/.test(line)).map((line) => line.split('=')[0] ?? '');
    expect(names.filter((name) => SECRET_NAME.test(name))).toEqual([]);
  });

  it('has no placeholder-style credentials in .env.example', () => {
    const content = readFileSync(join(ROOT, '.env.example'), 'utf8');
    expect(content).not.toMatch(/sk-[A-Za-z0-9]{10,}/);
  });

  it('never reads secret-looking import.meta.env variables in source', () => {
    const offenders = sourceFiles(join(ROOT, 'src'))
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .filter((file) => /import\.meta\.env\.VITE_\w*(KEY|SECRET|PASSWORD|TOKEN)/i.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('contains no hardcoded server URLs in source', () => {
    const offenders = sourceFiles(join(ROOT, 'src'))
      .filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith('schema.d.ts'))
      .filter((file) => /https?:\/\/localhost/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
