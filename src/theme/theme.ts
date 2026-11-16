import { DARK_SCHEME_QUERY, THEME_STORAGE_KEY } from '../constants';

export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export type ResolvedTheme = 'light' | 'dark';

export const DEFAULT_THEME_MODE: ThemeMode = 'system';

export const isThemeMode = (value: unknown): value is ThemeMode =>
  typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value);

// Storage can throw (private mode, disabled storage); an invalid value falls back to the default.
export function readStoredTheme(storage: Pick<Storage, 'getItem'> = window.localStorage): ThemeMode {
  try {
    const value = storage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(value) ? value : DEFAULT_THEME_MODE;
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

export function writeStoredTheme(mode: ThemeMode, storage: Pick<Storage, 'setItem'> = window.localStorage): boolean {
  try {
    storage.setItem(THEME_STORAGE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

export const resolveTheme = (mode: ThemeMode, prefersDark: boolean): ResolvedTheme =>
  mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;

export const systemPrefersDark = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia(DARK_SCHEME_QUERY).matches;

export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
