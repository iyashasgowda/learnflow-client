import { useState } from 'react';
import type { Task, TaskFilter, TaskSort } from '../api/tasks';
import { MESSAGES, TASK_LIMITS } from '../constants';
import { describeAuthError } from '../auth/authForm';
import { useAsyncAction } from '../auth/useAsyncAction';
import { AddTaskForm } from '../components/AddTaskForm';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TaskItem } from '../components/TaskItem';
import { useDeleteTask, useTasks } from '../tasks/hooks';

const FILTERS: Array<{ value: TaskFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
];

const SORTS: Array<{ value: TaskSort; label: string }> = [
  { value: 'created', label: 'Newest first' },
  { value: 'due', label: 'Due date' },
  { value: 'priority', label: 'Priority' },
];

const EMPTY_TEXT: Record<TaskFilter, string> = {
  all: 'You have no tasks yet. Add your first task above to get started.',
  active: 'No active tasks. Everything is done, or nothing has been added yet.',
  completed: 'No completed tasks yet. Tick a task to mark it done.',
};

export function TasksPage() {
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [sort, setSort] = useState<TaskSort>('created');
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const tasks = useTasks({ status: filter, sort, page, pageSize: TASK_LIMITS.pageSize });
  const remove = useDeleteTask();
  const deleteAction = useAsyncAction();

  const data = tasks.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const pastLastPage = data !== undefined && data.items.length === 0 && data.total > 0 && page > 1;

  const changeFilter = (next: TaskFilter) => {
    setFilter(next);
    setPage(1);
  };

  const closeDialog = () => {
    setDeleting(null);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteError(null);
    const target = deleting;
    const result = await deleteAction.run(() => remove.mutateAsync(target.id));
    if (!result) return;
    if (result.ok) {
      closeDialog();
      setNotice(`Deleted “${target.title}”.`);
      return;
    }
    setDeleteError(describeAuthError(result.error).form ?? MESSAGES.generic);
  };

  return (
    <>
      <section className="card" aria-labelledby="page-heading">
        <h1 id="page-heading">Tasks</h1>
        <AddTaskForm onAdded={() => setNotice('Task added.')} />
      </section>

      <section className="card" aria-label="Your tasks" aria-busy={tasks.isFetching}>
        <div className="task-toolbar">
          <div role="group" aria-label="Filter tasks" className="chips">
            {FILTERS.map((item) => (
              <button key={item.value} type="button" className="chip" aria-pressed={filter === item.value} onClick={() => changeFilter(item.value)}>
                {item.label}
              </button>
            ))}
          </div>
          <label className="theme-select">
            <span className="toolbar-label">Sort by</span>
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as TaskSort);
                setPage(1);
              }}
            >
              {SORTS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p role="status" aria-live="polite" className="text-muted task-notice">
          {notice}
        </p>

        {tasks.isPending && <p role="status">Loading tasks…</p>}

        {tasks.isError && (
          <div role="alert" className="notice">
            <p>{describeAuthError(tasks.error).form ?? MESSAGES.generic}</p>
            <button type="button" className="button" onClick={() => void tasks.refetch()}>
              Retry
            </button>
          </div>
        )}

        {data && data.total === 0 && <p>{EMPTY_TEXT[filter]}</p>}

        {pastLastPage && (
          <p>
            This page is empty because tasks were removed.{' '}
            <button type="button" className="button button-quiet" onClick={() => setPage(totalPages)}>
              Go to the last page
            </button>
          </p>
        )}

        {data && data.items.length > 0 && (
          <ul className="task-list">
            {data.items.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                editing={editingId === task.id}
                onEdit={() => setEditingId(task.id)}
                onDoneEditing={(message) => {
                  setEditingId(null);
                  if (message) setNotice(message);
                }}
                onDelete={() => setDeleting(task)}
              />
            ))}
          </ul>
        )}

        {data && data.total > data.pageSize && (
          <nav className="pagination" aria-label="Task pages">
            <button type="button" className="button button-quiet" onClick={() => setPage(page - 1)} disabled={page <= 1}>
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button type="button" className="button button-quiet" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>
              Next
            </button>
          </nav>
        )}
      </section>

      {deleting && (
        <ConfirmDialog
          title="Delete this task?"
          confirmLabel="Delete task"
          pendingLabel="Deleting…"
          pending={deleteAction.pending}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={closeDialog}
        >
          <p>
            “{deleting.title}” will be permanently deleted. This cannot be undone.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
