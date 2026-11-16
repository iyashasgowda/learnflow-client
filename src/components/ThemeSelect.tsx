import { useOptionalSettings } from '../settings/settingsContext';
import { useTheme } from '../theme/themeContext';
import { isThemeMode } from '../theme/theme';

// Inside the signed-in app the choice is saved to the account; on the sign-in pages it stays on this device.
export function ThemeSelect() {
  const { mode, setMode } = useTheme();
  const settings = useOptionalSettings();
  return (
    <label className="theme-select">
      <span className="visually-hidden">Theme</span>
      <select
        value={settings ? settings.settings.theme : mode}
        onChange={(event) => {
          const next = event.target.value;
          if (!isThemeMode(next)) return;
          if (settings) void settings.update({ theme: next });
          else setMode(next);
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
