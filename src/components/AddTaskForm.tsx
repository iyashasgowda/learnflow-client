import { useState } from 'react';
import { useCreateTask } from '../tasks/hooks';
import { compact, describeAuthError, type FieldErrors } from '../auth/authForm';
import { useAsyncAction } from '../auth/useAsyncAction';
import { EMPTY_TASK_VALUES, TASK_FIELD_ORDER, toTaskPayload, validateTaskValues, type TaskFormValues } from '../tasks/taskFormModel';
import { TaskForm } from './TaskForm';

const FIELDS = [...TASK_FIELD_ORDER];
const PREFIX = 'new-task';

export function AddTaskForm({ onAdded }: { onAdded: () => void }) {
  const [values, setValues] = useState<TaskFormValues>(EMPTY_TASK_VALUES);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const create = useCreateTask();
  const action = useAsyncAction();

  const focus = (found: FieldErrors) => {
    const first = TASK_FIELD_ORDER.find((name) => found[name]);
    if (first) document.getElementById(`${PREFIX}-${first}`)?.focus();
  };

  const submit = async () => {
    const found = compact(validateTaskValues(values));
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      focus(found);
      return;
    }
    const result = await action.run(() => create.mutateAsync(toTaskPayload(values)));
    if (!result) return;
    if (result.ok) {
      setValues({ ...EMPTY_TASK_VALUES, priority: values.priority });
      onAdded();
      document.getElementById(`${PREFIX}-title`)?.focus();
      return;
    }
    const described = describeAuthError(result.error, { fields: FIELDS });
    setFormError(described.form ?? null);
    setErrors(described.fields ?? {});
    focus(described.fields ?? {});
  };

  return (
    <TaskForm
      idPrefix={PREFIX}
      label="Add a task"
      values={values}
      onChange={setValues}
      errors={errors}
      formError={formError}
      pending={action.pending}
      submitLabel="Add task"
      pendingLabel="Adding…"
      onSubmit={submit}
    />
  );
}
