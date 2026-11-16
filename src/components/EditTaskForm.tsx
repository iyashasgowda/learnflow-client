import { useId, useState } from 'react';
import { ApiError } from '../api/client';
import type { Task } from '../api/tasks';
import { ERROR_CODES } from '../constants';
import { compact, describeAuthError, type FieldErrors } from '../auth/authForm';
import { useAsyncAction } from '../auth/useAsyncAction';
import { useUpdateTask } from '../tasks/hooks';
import { TASK_FIELD_ORDER, toTaskPayload, validateTaskValues, valuesFromTask, type TaskFormValues } from '../tasks/taskFormModel';
import { TaskForm } from './TaskForm';

const FIELDS = [...TASK_FIELD_ORDER];

interface Props {
  task: Task;
  onDone: (message?: string) => void;
}

export function EditTaskForm({ task, onDone }: Props) {
  const prefix = `edit-${useId()}`;
  const [values, setValues] = useState<TaskFormValues>(valuesFromTask(task));
  // The version the draft is based on; reloading after a conflict moves it forward without touching the draft.
  const [version, setVersion] = useState(task.version);
  const [conflict, setConflict] = useState<Task | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const update = useUpdateTask();
  const action = useAsyncAction();

  const focus = (found: FieldErrors) => {
    const first = TASK_FIELD_ORDER.find((name) => found[name]);
    if (first) document.getElementById(`${prefix}-${first}`)?.focus();
  };

  const submit = async () => {
    const found = compact(validateTaskValues(values));
    setErrors(found);
    setFormError(null);
    setNotice(null);
    if (Object.keys(found).length > 0) {
      focus(found);
      return;
    }
    const result = await action.run(() => update.mutateAsync({ id: task.id, patch: { version, ...toTaskPayload(values) } }));
    if (!result) return;
    if (result.ok) {
      onDone('Task saved.');
      return;
    }
    const error = result.error;
    if (error instanceof ApiError && error.code === ERROR_CODES.VERSION_CONFLICT && error.details?.task) {
      setConflict(error.details.task as Task);
      return;
    }
    const described = describeAuthError(error, { fields: FIELDS });
    setFormError(described.form ?? null);
    setErrors(described.fields ?? {});
    focus(described.fields ?? {});
  };

  const keepMyEdits = () => {
    if (!conflict) return;
    setVersion(conflict.version);
    setConflict(null);
    setNotice('You are now editing the latest version. Save again to apply your changes on top of it.');
  };

  const useLatest = () => {
    if (!conflict) return;
    setValues(valuesFromTask(conflict));
    setVersion(conflict.version);
    setConflict(null);
    setNotice('Loaded the latest version. Your edits were discarded.');
  };

  return (
    <TaskForm
      idPrefix={prefix}
      label={`Edit task: ${task.title}`}
      values={values}
      onChange={setValues}
      errors={errors}
      formError={formError}
      pending={action.pending}
      submitLabel="Save"
      pendingLabel="Saving…"
      onSubmit={submit}
      onCancel={() => onDone()}
    >
      {conflict && (
        <div role="alert" className="notice">
          <p>
            <strong>This task was changed somewhere else.</strong> The latest version is titled “{conflict.title}”. Your edits are still here.
          </p>
          <div className="button-row">
            <button type="button" className="button" onClick={keepMyEdits}>
              Keep my edits
            </button>
            <button type="button" className="button button-quiet" onClick={useLatest}>
              Use the latest version
            </button>
          </div>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
    </TaskForm>
  );
}
