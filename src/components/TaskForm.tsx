import type { ReactNode } from 'react';
import type { FieldErrors } from '../auth/authForm';
import type { TaskPriority } from '../api/tasks';
import type { TaskFormValues } from '../tasks/taskFormModel';
import { FormField } from './FormField';

interface Props {
  idPrefix: string;
  label: string;
  values: TaskFormValues;
  onChange: (values: TaskFormValues) => void;
  errors: FieldErrors;
  formError: string | null;
  pending: boolean;
  submitLabel: string;
  pendingLabel: string;
  onSubmit: () => void;
  onCancel?: () => void;
  children?: ReactNode;
}

export function TaskForm({ idPrefix, label, values, onChange, errors, formError, pending, submitLabel, pendingLabel, onSubmit, onCancel, children }: Props) {
  const set = <K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) => onChange({ ...values, [key]: value });
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <form
      noValidate
      className="task-form"
      aria-label={label}
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <FormField id={id('title')} label="Title" type="text" autoComplete="off" value={values.title} onChange={(value) => set('title', value)} error={errors.title} />

      <div className="form-field">
        <label htmlFor={id('description')}>Description (optional)</label>
        <textarea
          id={id('description')}
          rows={2}
          value={values.description}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? id('description-error') : undefined}
          onChange={(event) => set('description', event.target.value)}
        />
        {errors.description && (
          <p id={id('description-error')} className="field-error">
            {errors.description}
          </p>
        )}
      </div>

      <div className="form-row">
        <FormField id={id('dueDate')} label="Due date (optional)" type="date" autoComplete="off" value={values.dueDate} onChange={(value) => set('dueDate', value)} error={errors.dueDate} />
        <div className="form-field">
          <label htmlFor={id('priority')}>Priority</label>
          <select id={id('priority')} value={values.priority} onChange={(event) => set('priority', event.target.value as TaskPriority)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      {children}
      {formError && (
        <p role="alert" className="form-error">
          {formError}
        </p>
      )}
      <div className="button-row">
        <button type="submit" className="button" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="button button-quiet" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
