import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY } from '../src/constants';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import {
  applyTheme,
  isThemeMode,
  readStoredTheme,
  resolveTheme,
  systemPrefersDark,
  writeStoredTheme,
} from '../src/theme/theme';
import { ThemeSelect } from '../src/components/ThemeSelect';
import { useTheme } from '../src/theme/themeContext';

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

describe('theme storage', () => {
  it('reads a valid stored value', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readStoredTheme()).toBe('dark');
  });

  it('falls back to system for corrupt or missing values', () => {
    expect(readStoredTheme()).toBe('system');
    window.localStorage.setItem(THEME_STORAGE_KEY, '{"mode":"dark"}');
    expect(readStoredTheme()).toBe('system');
    window.localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(readStoredTheme()).toBe('system');
  });

  it('falls back to system when storage throws', () => {
    expect(
      readStoredTheme({
        getItem: () => {
          throw new Error('denied');
        },
      }),
    ).toBe('system');
  });

  it('reports whether a write succeeded', () => {
    expect(writeStoredTheme('light')).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(
      writeStoredTheme('dark', {
        setItem: () => {
          throw new Error('quota');
        },
      }),
    ).toBe(false);
  });

  it('validates modes', () => {
    expect(isThemeMode('dark')).toBe(true);
    expect(isThemeMode('nope')).toBe(false);
    expect(isThemeMode(undefined)).toBe(false);
  });
});

describe('theme resolution', () => {
  it('follows the system preference only in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('applies the resolved theme to the document', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('treats a missing matchMedia as a light system', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(systemPrefersDark()).toBe(false);
  });
});

function ThemeProbe() {
  const { mode, resolved } = useTheme();
  return <p data-testid="probe">{`${mode}:${resolved}`}</p>;
}

describe('ThemeProvider', () => {
  const mockSystem = (dark: boolean) => {
    const listeners = new Set<() => void>();
    const query = {
      matches: dark,
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    };
    vi.stubGlobal('matchMedia', () => query);
    return {
      change(next: boolean) {
        query.matches = next;
        listeners.forEach((cb) => cb());
      },
    };
  };

  it('applies, persists, and switches themes across the app', async () => {
    mockSystem(false);
    render(
      <ThemeProvider>
        <ThemeSelect />
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('system:light');
    expect(document.documentElement.dataset.theme).toBe('light');

    await userEvent.selectOptions(screen.getByLabelText('Theme'), 'dark');
    expect(screen.getByTestId('probe')).toHaveTextContent('dark:dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('restores the stored theme after a reload', () => {
    mockSystem(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('dark:dark');
  });

  it('follows system changes while in system mode', async () => {
    const system = mockSystem(false);
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('system:light');
    system.change(true);
    expect(await screen.findByText('system:dark')).toBeInTheDocument();
  });

  it('works when the stored value is corrupt', () => {
    mockSystem(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'garbage');
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('system:dark');
  });
});

describe('useTheme', () => {
  it('throws outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<ThemeProbe />)).toThrow(/ThemeProvider/);
    spy.mockRestore();
  });
});
