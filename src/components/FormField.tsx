import type { ChangeEvent } from 'react';

interface Props {
  id: string;
  label: string;
  type: 'email' | 'password' | 'text' | 'date' | 'number' | 'time';
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  error?: string | undefined;
  hint?: string;
}

export function FormField({ id, label, type, value, onChange, autoComplete, error, hint }: Props) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
