import { useState } from 'react';
import type { Task } from '../api/tasks';
import { MESSAGES } from '../constants';
import { describeAuthError } from '../auth/authForm';
import { useAsyncAction } from '../auth/useAsyncAction';
import { useUpdateTask } from '../tasks/hooks';
import { formatDueDate } from '../tasks/taskFormModel';
import { EditTaskForm } from './EditTaskForm';

const PRIORITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High' } as const;

interface Props {
  task: Task;
  editing: boolean;
  onEdit: () => void;
  onDoneEditing: (message?: string) => void;
  onDelete: () => void;
}

export function TaskItem({ task, editing, onEdit, onDoneEditing, onDelete }: Props) {
  const update = useUpdateTask();
  const action = useAsyncAction();
  const [error, setError] = useState<string | null>(null);
  const completed = task.status === 'completed';

  const toggle = async () => {
    setError(null);
    const result = await action.run(() => update.mutateAsync({ id: task.id, patch: { version: task.version, completed: !completed } }));
    if (result && !result.ok) {
      const described = describeAuthError(result.error);
      // A conflict means the list was stale; it has been refreshed, so say so instead of failing silently.
      setError(described.form ?? MESSAGES.generic);
    }
  };

  if (editing) {
    return (
      <li className="task task-editing">
        <EditTaskForm task={task} onDone={onDoneEditing} />
      </li>
    );
  }

  return (
    <li className={`task${completed ? ' task-done' : ''}`}>
      <input
        type="checkbox"
        className="task-check"
        checked={completed}
        disabled={action.pending}
        aria-label={`${completed ? 'Mark as not done' : 'Mark as done'}: ${task.title}`}
        onChange={toggle}
      />
      <div className="task-body">
        <p className="task-title">{task.title}</p>
        {task.description && <p className="task-description">{task.description}</p>}
        <p className="task-meta">
          <span className={`badge badge-${task.priority}`}>{PRIORITY_LABEL[task.priority]} priority</span>
          {task.dueDate && <span>Due {formatDueDate(task.dueDate)}</span>}
          {task.overdue && <span className="badge badge-overdue">Overdue</span>}
          {completed && <span>Done</span>}
        </p>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
      </div>
      <div className="task-actions">
        <button type="button" className="button button-quiet" onClick={onEdit} aria-label={`Edit: ${task.title}`}>
          Edit
        </button>
        <button type="button" className="button button-quiet" onClick={onDelete} aria-label={`Delete: ${task.title}`}>
          Delete
        </button>
      </div>
    </li>
  );
}
