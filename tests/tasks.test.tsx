import { createEvent, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../src/api/queryClient';
import type { Task } from '../src/api/tasks';
import { errorResponse, jsonResponse, makeTask, renderSignedIn, stubApi, taskList, type RouteHandler } from './testUtils';

afterEach(() => {
  vi.unstubAllGlobals();
});

const addForm = () => within(screen.getByRole('form', { name: 'Add a task' }));
const queryOf = (path: string) => new URL(path, 'http://localhost').searchParams;

// An in-memory stand-in for the task API, with the same version rule as the real one.
function taskServer(initial: Task[]) {
  const store = [...initial];
  const find = (id: string) => store.find((task) => task.id === id);
  const routes: Record<string, RouteHandler> = {
    'GET /api/tasks': () => jsonResponse(taskList(store)),
    'POST /api/tasks': ({ body }) => {
      const created = makeTask({ id: `task-${store.length + 1}`, ...(body as Partial<Task>) });
      store.unshift(created);
      return jsonResponse(created, 201);
    },
  };
  for (const task of initial) {
    routes[`PATCH /api/tasks/${task.id}`] = ({ body }) => {
      const current = find(task.id)!;
      const { completed, version, ...fields } = body as Partial<Task> & { version: number; completed?: boolean };
      if (version !== current.version) return errorResponse('VERSION_CONFLICT', 'This task was changed elsewhere.', 409, { task: current });
      Object.assign(current, fields, { version: current.version + 1 });
      if (completed !== undefined) current.status = completed ? 'completed' : 'active';
      return jsonResponse(current);
    };
    routes[`DELETE /api/tasks/${task.id}`] = () => {
      store.splice(store.indexOf(find(task.id)!), 1);
      return new Response(null, { status: 204 });
    };
  }
  return { store, routes, change: (id: string, changes: Partial<Task>) => Object.assign(find(id)!, changes, { version: find(id)!.version + 1 }) };
}

describe('Tasks page states', () => {
  it('shows a loading message, then the empty state that invites the first task', async () => {
    stubApi();
    await renderSignedIn('/tasks');
    expect(await screen.findByText(/You have no tasks yet/)).toBeInTheDocument();
    expect(screen.queryByText('Loading tasks…')).not.toBeInTheDocument();
  });

  it('shows a different empty message for each filter', async () => {
    stubApi();
    await renderSignedIn('/tasks');
    await screen.findByText(/You have no tasks yet/);
    await userEvent.click(screen.getByRole('button', { name: 'Active' }));
    expect(await screen.findByText(/No active tasks/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Completed' }));
    expect(await screen.findByText(/No completed tasks yet/)).toBeInTheDocument();
  });

  it('shows an error with a retry that loads the list', async () => {
    let fail = true;
    const server = taskServer([makeTask()]);
    stubApi({
      'GET /api/tasks': (request) => (fail ? errorResponse('INTERNAL', 'Could not load tasks.', 500) : server.routes['GET /api/tasks']!(request)),
    });
    await renderSignedIn('/tasks');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load tasks.');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Read chapter 4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('shows priority, due date, and an overdue badge from the server flag', async () => {
    const server = taskServer([
      makeTask({ id: 'task-1', title: 'Late essay', dueDate: '2020-06-15', priority: 'high', overdue: true, description: 'Two pages' }),
      makeTask({ id: 'task-2', title: 'Easy reading', dueDate: '2099-01-02', priority: 'low' }),
    ]);
    stubApi(server.routes);
    await renderSignedIn('/tasks');
    const late = (await screen.findByText('Late essay')).closest('li')!;
    expect(within(late).getByText('High priority')).toBeInTheDocument();
    expect(within(late).getByText(/Due Jun 15, 2020/)).toBeInTheDocument();
    expect(within(late).getByText('Overdue')).toBeInTheDocument();
    expect(within(late).getByText('Two pages')).toBeInTheDocument();
    const easy = screen.getByText('Easy reading').closest('li')!;
    expect(within(easy).queryByText('Overdue')).not.toBeInTheDocument();
    expect(within(easy).getByText(/Due Jan 2, 2099/)).toBeInTheDocument();
  });
});

describe('creating tasks', () => {
  it('sends the task, shows it in the list, announces it, and clears the form', async () => {
    const server = taskServer([]);
    const api = stubApi(server.routes);
    await renderSignedIn('/tasks');
    await screen.findByText(/You have no tasks yet/);

    await userEvent.type(addForm().getByLabelText('Title'), '  Write summary  ');
    await userEvent.type(addForm().getByLabelText('Description (optional)'), 'Chapters 1 to 3');
    await userEvent.type(addForm().getByLabelText('Due date (optional)'), '2099-03-04');
    await userEvent.selectOptions(addForm().getByLabelText('Priority'), 'high');
    await userEvent.click(addForm().getByRole('button', { name: 'Add task' }));

    expect(await screen.findByText('Write summary')).toBeInTheDocument();
    const [call] = api.callsTo('POST /api/tasks');
    expect(call?.body).toEqual({ title: 'Write summary', description: 'Chapters 1 to 3', dueDate: '2099-03-04', priority: 'high' });
    expect(call?.headers.get('X-Requested-With')).toBe('LearnFlow');
    expect(screen.getByText('Task added.')).toBeInTheDocument();
    expect(addForm().getByLabelText('Title')).toHaveValue('');
    expect(addForm().getByLabelText('Title')).toHaveFocus();
    expect(addForm().getByLabelText('Priority')).toHaveValue('high');
  });

  it('sends no due date when the field is empty', async () => {
    const server = taskServer([]);
    const api = stubApi(server.routes);
    await renderSignedIn('/tasks');
    await userEvent.type(addForm().getByLabelText('Title'), 'No deadline');
    await userEvent.click(addForm().getByRole('button', { name: 'Add task' }));
    await screen.findByText('Task added.');
    expect(api.callsTo('POST /api/tasks')[0]?.body).toMatchObject({ dueDate: null });
  });

  it('refuses a blank title without calling the server and focuses the field', async () => {
    const api = stubApi();
    await renderSignedIn('/tasks');
    await screen.findByText(/You have no tasks yet/);
    await userEvent.type(addForm().getByLabelText('Title'), '   ');
    await userEvent.click(addForm().getByRole('button', { name: 'Add task' }));
    expect(addForm().getByText('Enter a title.')).toBeInTheDocument();
    expect(addForm().getByLabelText('Title')).toHaveFocus();
    expect(addForm().getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
    expect(api.callsTo('POST /api/tasks')).toHaveLength(0);
  });

  it('refuses a title or description that is too long', async () => {
    const api = stubApi();
    await renderSignedIn('/tasks');
    await userEvent.click(addForm().getByLabelText('Title'));
    await userEvent.paste('x'.repeat(201));
    await userEvent.click(addForm().getByLabelText('Description (optional)'));
    await userEvent.paste('y'.repeat(2001));
    await userEvent.click(addForm().getByRole('button', { name: 'Add task' }));
    expect(addForm().getByText('Use at most 200 characters.')).toBeInTheDocument();
    expect(addForm().getByText('Use at most 2000 characters.')).toBeInTheDocument();
    expect(addForm().getByLabelText('Description (optional)')).toHaveAttribute('aria-invalid', 'true');
    expect(api.callsTo('POST /api/tasks')).toHaveLength(0);
  });

  it('sends one request when the button is clicked twice', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const server = taskServer([]);
    const api = stubApi({
      ...server.routes,
      'POST /api/tasks': async (request) => {
        await gate;
        return server.routes['POST /api/tasks']!(request);
      },
    });
    await renderSignedIn('/tasks');
    await userEvent.type(addForm().getByLabelText('Title'), 'Once only');
    const button = addForm().getByRole('button', { name: 'Add task' });
    await userEvent.dblClick(button);
    expect(await addForm().findByRole('button', { name: 'Adding…' })).toBeDisabled();
    release();
    await screen.findByText('Task added.');
    expect(api.callsTo('POST /api/tasks')).toHaveLength(1);
  });

  it('shows a server field message next to the field', async () => {
    stubApi({
      'POST /api/tasks': () => errorResponse('VALIDATION_ERROR', 'Check the highlighted fields.', 400, { fields: [{ path: 'title', message: 'That title is not allowed.' }] }),
    });
    await renderSignedIn('/tasks');
    await userEvent.type(addForm().getByLabelText('Title'), 'Something');
    await userEvent.click(addForm().getByRole('button', { name: 'Add task' }));
    expect(await addForm().findByText('That title is not allowed.')).toBeInTheDocument();
    expect(addForm().getByLabelText('Title')).toHaveValue('Something');
  });

  it('keeps what was typed and shows a message when the request fails', async () => {
    stubApi({ 'POST /api/tasks': () => errorResponse('INTERNAL', 'Something went wrong on our side.', 500) });
    await renderSignedIn('/tasks');
    await userEvent.type(addForm().getByLabelText('Title'), 'Keep me');
    await userEvent.click(addForm().getByRole('button', { name: 'Add task' }));
    expect(await addForm().findByRole('alert')).toHaveTextContent('Something went wrong on our side.');
    expect(addForm().getByLabelText('Title')).toHaveValue('Keep me');
    expect(addForm().getByRole('button', { name: 'Add task' })).toBeEnabled();
  });
});

describe('filter, sort, and paging', () => {
  it('requests the chosen filter and marks it as pressed', async () => {
    const server = taskServer([makeTask()]);
    const api = stubApi(server.routes);
    await renderSignedIn('/tasks');
    await screen.findByText('Read chapter 4');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Completed' }));
    await waitFor(() => expect(api.callsTo('GET /api/tasks').some((call) => queryOf(call.path).get('status') === 'completed')).toBe(true));
    expect(screen.getByRole('button', { name: 'Completed' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('requests the chosen sort order and returns to the first page', async () => {
    const server = taskServer([makeTask()]);
    const api = stubApi({ ...server.routes, 'GET /api/tasks': (request) => jsonResponse(taskList([makeTask()], { total: 25, page: Number(queryOf(request.path).get('page')) })) });
    await renderSignedIn('/tasks');
    await screen.findByText('Page 1 of 3');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Page 2 of 3');
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'due');
    await screen.findByText('Page 1 of 3');
    const last = api.callsTo('GET /api/tasks').at(-1)!;
    expect(queryOf(last.path).get('sort')).toBe('due');
    expect(queryOf(last.path).get('page')).toBe('1');
  });

  it('pages forward and back and disables the buttons at the ends', async () => {
    stubApi({ 'GET /api/tasks': (request) => jsonResponse(taskList([makeTask()], { total: 25, page: Number(queryOf(request.path).get('page')) })) });
    await renderSignedIn('/tasks');
    await screen.findByText('Page 1 of 3');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Page 2 of 3');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Page 3 of 3');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await screen.findByText('Page 2 of 3');
  });

  it('hides paging when everything fits on one page', async () => {
    stubApi({ 'GET /api/tasks': () => jsonResponse(taskList([makeTask()])) });
    await renderSignedIn('/tasks');
    await screen.findByText('Read chapter 4');
    expect(screen.queryByRole('navigation', { name: 'Task pages' })).not.toBeInTheDocument();
  });

  it('offers a way back when deleting empties the current page', async () => {
    let removed = false;
    const second = makeTask({ id: 'task-11', title: 'Eleventh' });
    const api = stubApi({
      'GET /api/tasks': (request) => {
        const page = Number(queryOf(request.path).get('page'));
        if (page === 1) return jsonResponse(taskList([makeTask()], { total: removed ? 10 : 11 }));
        return jsonResponse(taskList(removed ? [] : [second], { total: removed ? 10 : 11, page }));
      },
      'DELETE /api/tasks/task-11': () => {
        removed = true;
        return new Response(null, { status: 204 });
      },
    });
    await renderSignedIn('/tasks');
    await screen.findByText('Page 1 of 2');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Eleventh');
    await userEvent.click(screen.getByRole('button', { name: 'Delete: Eleventh' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete task' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Go to the last page' }));
    await screen.findByText('Read chapter 4');
    expect(queryOf(api.callsTo('GET /api/tasks').at(-1)!.path).get('page')).toBe('1');
  });
});

describe('completing tasks', () => {
  it('sends the version with the completion and shows the task as done', async () => {
    const server = taskServer([makeTask()]);
    const api = stubApi(server.routes);
    await renderSignedIn('/tasks');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Mark as done: Read chapter 4' }));
    const reopen = await screen.findByRole('checkbox', { name: 'Mark as not done: Read chapter 4' });
    expect(reopen).toBeChecked();
    expect(api.callsTo('PATCH /api/tasks/task-1')[0]?.body).toEqual({ version: 1, completed: true });
    await userEvent.click(reopen);
    await screen.findByRole('checkbox', { name: 'Mark as done: Read chapter 4' });
    expect(api.callsTo('PATCH /api/tasks/task-1')[1]?.body).toEqual({ version: 2, completed: false });
  });

  it('says so when the task was changed elsewhere and shows the refreshed list', async () => {
    const server = taskServer([makeTask()]);
    stubApi(server.routes);
    await renderSignedIn('/tasks');
    await screen.findByText('Read chapter 4');
    server.change('task-1', { title: 'Renamed elsewhere' });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark as done: Read chapter 4' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This task was changed elsewhere.');
    expect(await screen.findByText('Renamed elsewhere')).toBeInTheDocument();
  });
});

describe('editing tasks', () => {
  const openEditor = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Edit: Read chapter 4' }));
    return within(screen.getByRole('form', { name: 'Edit task: Read chapter 4' }));
  };

  it('saves the changes with the current version', async () => {
    const server = taskServer([makeTask({ dueDate: '2099-01-02', description: 'old' })]);
    const api = stubApi(server.routes);
    await renderSignedIn('/tasks');
    const form = await openEditor();
    expect(form.getByLabelText('Title')).toHaveValue('Read chapter 4');
    expect(form.getByLabelText('Due date (optional)')).toHaveValue('2099-01-02');
    await userEvent.clear(form.getByLabelText('Title'));
    await userEvent.type(form.getByLabelText('Title'), 'Read chapter 5');
    await userEvent.selectOptions(form.getByLabelText('Priority'), 'low');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Read chapter 5')).toBeInTheDocument();
    expect(screen.getByText('Task saved.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: /Edit task/ })).not.toBeInTheDocument();
    expect(api.callsTo('PATCH /api/tasks/task-1')[0]?.body).toEqual({ version: 1, title: 'Read chapter 5', description: 'old', dueDate: '2099-01-02', priority: 'low' });
  });

  it('can clear the due date', async () => {
    const server = taskServer([makeTask({ dueDate: '2099-01-02' })]);
    const api = stubApi(server.routes);
    await renderSignedIn('/tasks');
    const form = await openEditor();
    await userEvent.clear(form.getByLabelText('Due date (optional)'));
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    await screen.findByText('Task saved.');
    expect(api.callsTo('PATCH /api/tasks/task-1')[0]?.body).toMatchObject({ dueDate: null });
  });

  it('closes without saving on cancel', async () => {
    const server = taskServer([makeTask()]);
    const api = stubApi(server.routes);
    await renderSignedIn('/tasks');
    const form = await openEditor();
    await userEvent.type(form.getByLabelText('Title'), ' extra');
    await userEvent.click(form.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form', { name: /Edit task/ })).not.toBeInTheDocument();
    expect(screen.getByText('Read chapter 4')).toBeInTheDocument();
    expect(api.callsTo('PATCH /api/tasks/task-1')).toHaveLength(0);
  });

  it('refuses a blank title and keeps the editor open', async () => {
    const server = taskServer([makeTask()]);
    const api = stubApi(server.routes);
    await renderSignedIn('/tasks');
    const form = await openEditor();
    await userEvent.clear(form.getByLabelText('Title'));
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    expect(form.getByText('Enter a title.')).toBeInTheDocument();
    expect(form.getByLabelText('Title')).toHaveFocus();
    expect(api.callsTo('PATCH /api/tasks/task-1')).toHaveLength(0);
  });

  it('shows a server field message and a general failure message', async () => {
    const server = taskServer([makeTask()]);
    let mode: 'field' | 'general' = 'field';
    stubApi({
      ...server.routes,
      'PATCH /api/tasks/task-1': () =>
        mode === 'field'
          ? errorResponse('VALIDATION_ERROR', 'Check the highlighted fields.', 400, { fields: [{ path: 'title', message: 'That title is not allowed.' }] })
          : errorResponse('INTERNAL', 'Something went wrong on our side.', 500),
    });
    await renderSignedIn('/tasks');
    const form = await openEditor();
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    expect(await form.findByText('That title is not allowed.')).toBeInTheDocument();
    mode = 'general';
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    expect(await form.findByRole('alert')).toHaveTextContent('Something went wrong on our side.');
  });

  describe('when the task was changed somewhere else', () => {
    const conflict = async () => {
      const server = taskServer([makeTask()]);
      const api = stubApi(server.routes);
      await renderSignedIn('/tasks');
      const form = await openEditor();
      server.change('task-1', { title: 'Read chapter 9' });
      await userEvent.clear(form.getByLabelText('Title'));
      await userEvent.type(form.getByLabelText('Title'), 'My own title');
      await userEvent.click(form.getByRole('button', { name: 'Save' }));
      await form.findByText('This task was changed somewhere else.');
      return { form, api };
    };

    it('keeps the draft and saves it on top of the latest version', async () => {
      const { form, api } = await conflict();
      expect(form.getByLabelText('Title')).toHaveValue('My own title');
      await userEvent.click(form.getByRole('button', { name: 'Keep my edits' }));
      expect(form.queryByText('This task was changed somewhere else.')).not.toBeInTheDocument();
      expect(form.getByLabelText('Title')).toHaveValue('My own title');
      expect(form.getByText(/You are now editing the latest version/)).toBeInTheDocument();
      await userEvent.click(form.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('My own title')).toBeInTheDocument();
      expect(api.callsTo('PATCH /api/tasks/task-1').map((call) => (call.body as { version: number }).version)).toEqual([1, 2]);
    });

    it('replaces the draft with the latest version when asked', async () => {
      const { form, api } = await conflict();
      await userEvent.click(form.getByRole('button', { name: 'Use the latest version' }));
      expect(form.getByLabelText('Title')).toHaveValue('Read chapter 9');
      expect(form.getByText(/Your edits were discarded/)).toBeInTheDocument();
      await userEvent.click(form.getByRole('button', { name: 'Save' }));
      await screen.findByText('Task saved.');
      expect(api.callsTo('PATCH /api/tasks/task-1')[1]?.body).toMatchObject({ version: 2, title: 'Read chapter 9' });
    });
  });
});

describe('deleting tasks', () => {
  const openDialog = async () => {
    const trigger = await screen.findByRole('button', { name: 'Delete: Read chapter 4' });
    await userEvent.click(trigger);
    return { trigger, dialog: screen.getByRole('dialog', { name: 'Delete this task?' }) };
  };

  it('asks first, names the task, and focuses the safe choice', async () => {
    stubApi(taskServer([makeTask()]).routes);
    await renderSignedIn('/tasks');
    const { dialog } = await openDialog();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText(/“Read chapter 4” will be permanently deleted/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('deletes after confirmation and announces it', async () => {
    const server = taskServer([makeTask()]);
    const api = stubApi(server.routes);
    await renderSignedIn('/tasks');
    const { dialog } = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete task' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.callsTo('DELETE /api/tasks/task-1')).toHaveLength(1);
    expect(api.callsTo('DELETE /api/tasks/task-1')[0]?.headers.get('X-Requested-With')).toBe('LearnFlow');
    expect(await screen.findByText(/You have no tasks yet/)).toBeInTheDocument();
    expect(screen.getByText('Deleted “Read chapter 4”.')).toBeInTheDocument();
  });

  it('does nothing on cancel and returns focus to the button that opened it', async () => {
    const api = stubApi(taskServer([makeTask()]).routes);
    await renderSignedIn('/tasks');
    const { trigger, dialog } = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(api.callsTo('DELETE /api/tasks/task-1')).toHaveLength(0);
  });

  it('closes on Escape and on a click outside the dialog', async () => {
    stubApi(taskServer([makeTask()]).routes);
    await renderSignedIn('/tasks');
    const first = await openDialog();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(first.trigger).toHaveFocus();

    const second = await openDialog();
    fireEvent.mouseDown(second.dialog);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(second.dialog.parentElement!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps keyboard focus inside the dialog', async () => {
    stubApi(taskServer([makeTask()]).routes);
    await renderSignedIn('/tasks');
    const { dialog } = await openDialog();
    const confirm = within(dialog).getByRole('button', { name: 'Delete task' });
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    cancel.focus();
    await userEvent.tab();
    expect(confirm).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(cancel).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(confirm).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(cancel).toHaveFocus();
  });

  it('ignores other keys inside the dialog', async () => {
    stubApi(taskServer([makeTask()]).routes);
    await renderSignedIn('/tasks');
    await openDialog();
    await userEvent.keyboard('a');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('keeps the dialog open with a message when the delete fails', async () => {
    const server = taskServer([makeTask()]);
    stubApi({ ...server.routes, 'DELETE /api/tasks/task-1': () => errorResponse('INTERNAL', 'Could not delete the task.', 500) });
    await renderSignedIn('/tasks');
    const { dialog } = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete task' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not delete the task.');
    expect(within(dialog).getByRole('button', { name: 'Delete task' })).toBeEnabled();
  });

  it('sends one request and blocks closing while the delete is running', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const server = taskServer([makeTask()]);
    const api = stubApi({
      ...server.routes,
      'DELETE /api/tasks/task-1': async (request) => {
        await gate;
        return server.routes['DELETE /api/tasks/task-1']!(request);
      },
    });
    await renderSignedIn('/tasks');
    const { dialog } = await openDialog();
    await userEvent.dblClick(within(dialog).getByRole('button', { name: 'Delete task' }));
    expect(await within(dialog).findByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    fireEvent.mouseDown(dialog.parentElement!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.callsTo('DELETE /api/tasks/task-1')).toHaveLength(1);
  });
});

describe('tasks and the session', () => {
  it('clears cached tasks when the user signs out', async () => {
    const client = createQueryClient();
    stubApi(taskServer([makeTask()]).routes);
    await renderSignedIn('/tasks', client);
    await screen.findByText('Read chapter 4');
    expect(client.getQueryCache().getAll().length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it('prevents the default action of the add form submit', async () => {
    stubApi();
    await renderSignedIn('/tasks');
    const form = screen.getByRole('form', { name: 'Add a task' });
    const event = createEvent.submit(form);
    fireEvent(form, event);
    expect(event.defaultPrevented).toBe(true);
  });
});
