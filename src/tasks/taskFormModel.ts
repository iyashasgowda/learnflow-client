import type { FieldErrors } from '../auth/authForm';
import type { Task, TaskPriority } from '../api/tasks';
import { TASK_LIMITS } from '../constants';

export interface TaskFormValues {
  title: string;
  description: string;
  // Empty string means no due date.
  dueDate: string;
  priority: TaskPriority;
}

export const EMPTY_TASK_VALUES: TaskFormValues = { title: '', description: '', dueDate: '', priority: 'medium' };

export const TASK_FIELD_ORDER = ['title', 'description', 'dueDate', 'priority'] as const;

export const valuesFromTask = (task: Task): TaskFormValues => ({
  title: task.title,
  description: task.description,
  dueDate: task.dueDate ?? '',
  priority: task.priority,
});

export function validateTaskValues(values: TaskFormValues): FieldErrors {
  const errors: FieldErrors = {};
  const title = values.title.trim();
  if (!title) errors.title = 'Enter a title.';
  else if (title.length > TASK_LIMITS.title) errors.title = `Use at most ${TASK_LIMITS.title} characters.`;
  if (values.description.length > TASK_LIMITS.description) errors.description = `Use at most ${TASK_LIMITS.description} characters.`;
  return errors;
}

export const toTaskPayload = (values: TaskFormValues) => ({
  title: values.title.trim(),
  description: values.description,
  dueDate: values.dueDate || null,
  priority: values.priority,
});

// Builds the date from its parts, so the day never shifts with the viewer's time zone.
export function formatDueDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
