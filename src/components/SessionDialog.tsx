import { useState } from 'react';
import type { StudySession } from '../api/sessions';
import { describeAuthError, type FieldErrors } from '../auth/authForm';
import { useAsyncAction } from '../auth/useAsyncAction';
import { MESSAGES, PLANNER_LIMITS } from '../constants';
import { useMaterials } from '../materials/hooks';
import { useCreateSession, useUpdateSession } from '../planner/hooks';
import { emptySessionForm, formFieldsFromServer, formFromSession, validateSessionForm, type SessionFormValues } from '../planner/schedule';
import { useSettings } from '../settings/settingsContext';
import { useTasks } from '../tasks/hooks';
import { ConfirmDialog } from './ConfirmDialog';
import { FormField } from './FormField';

interface Props {
  // The session being edited; none when adding.
  session: StudySession | null;
  // The day a new session starts on.
  defaultDate: string;
  onClose: (message?: string) => void;
}

const SERVER_FIELDS = ['title', 'startsAt', 'endsAt', 'materialId', 'taskId'] as const;

export function SessionDialog({ session, defaultDate, onClose }: Props) {
  const { timeZone } = useSettings().settings;
  const [values, setValues] = useState<SessionFormValues>(() => (session ? formFromSession(session, timeZone) : emptySessionForm(defaultDate)));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const create = useCreateSession();
  const update = useUpdateSession();
  const action = useAsyncAction();
  const materials = useMaterials();
  const tasks = useTasks({ status: 'all', sort: 'created', page: 1, pageSize: 100 });
  const set = <K extends keyof SessionFormValues>(key: K, value: SessionFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  const readyMaterials = (materials.data?.items ?? []).filter((material) => material.status === 'ready' || material.id === values.materialId);
  const taskOptions = tasks.data?.items ?? [];

  const save = async () => {
    setFormError(null);
    const checked = validateSessionForm(values, timeZone);
    setErrors(checked.ok ? {} : checked.errors);
    if (!checked.ok) return;

    const result = await action.run(() => (session ? update.mutateAsync({ id: session.id, patch: checked.request }) : create.mutateAsync(checked.request)));
    if (!result) return;
    if (result.ok) {
      onClose(session ? 'Session updated.' : 'Session added.');
      return;
    }
    const described = describeAuthError(result.error, { fields: SERVER_FIELDS });
    setErrors(formFieldsFromServer(described.fields ?? {}));
    setFormError(described.form ?? (described.fields ? null : MESSAGES.generic));
  };

  return (
    <ConfirmDialog title={session ? 'Edit study session' : 'Add a study session'} confirmLabel="Save session" pendingLabel="Saving…" pending={action.pending} error={formError} onConfirm={() => void save()} onCancel={() => onClose()}>
      <FormField id="session-title" label="Title" type="text" autoComplete="off" value={values.title} onChange={(value) => set('title', value)} error={errors.title} hint={`Up to ${PLANNER_LIMITS.titleMax} characters.`} />
      <div className="form-row">
        <FormField id="session-start-date" label="Start date" type="date" autoComplete="off" value={values.startDate} onChange={(value) => set('startDate', value)} error={errors.start} />
        <FormField id="session-start-time" label="Start time" type="time" autoComplete="off" value={values.startTime} onChange={(value) => set('startTime', value)} />
      </div>
      <div className="form-row">
        <FormField id="session-end-date" label="End date" type="date" autoComplete="off" value={values.endDate} onChange={(value) => set('endDate', value)} error={errors.end} />
        <FormField id="session-end-time" label="End time" type="time" autoComplete="off" value={values.endTime} onChange={(value) => set('endTime', value)} />
      </div>
      <p className="field-hint">Times are in your time zone: {timeZone.replaceAll('_', ' ')}. A session can last at most 12 hours.</p>

      <div className="form-field">
        <label htmlFor="session-material">Material (optional)</label>
        <select id="session-material" value={values.materialId} onChange={(event) => set('materialId', event.target.value)}>
          <option value="">None</option>
          {readyMaterials.map((material) => (
            <option key={material.id} value={material.id}>
              {material.name}
            </option>
          ))}
        </select>
        {errors.materialId && <p className="field-error">{errors.materialId}</p>}
      </div>
      <div className="form-field">
        <label htmlFor="session-task">Task (optional)</label>
        <select id="session-task" value={values.taskId} onChange={(event) => set('taskId', event.target.value)}>
          <option value="">None</option>
          {taskOptions.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title}
            </option>
          ))}
        </select>
        {errors.taskId && <p className="field-error">{errors.taskId}</p>}
      </div>
    </ConfirmDialog>
  );
}
